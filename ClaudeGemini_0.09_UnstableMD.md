import React, { useState, useCallback, useEffect } from 'react';
import { Calendar, MapPin, QrCode, Users, Send, CheckCircle, XCircle, Trash2, Search, PlusCircle, Edit } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  query, 
  where, 
  getDocs, 
  deleteDoc,
  onSnapshot,
  runTransaction 
} from 'firebase/firestore';

// --- SECURITY: Import crypto for encryption
import crypto from 'crypto-js';

// --- FIREBASE CONFIGURATION & INITIALIZATION ---
const firebaseConfig = typeof window.__firebase_config !== 'undefined' 
  ? JSON.parse(window.__firebase_config) 
  : {};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'default-app-id';

// Firestore Paths
const USERS_COLLECTION = `artifacts/${appId}/user_profiles`;
const EVENTS_COLLECTION_BASE = `artifacts/${appId}/events`;
const TICKETS_COLLECTION_BASE = `artifacts/${appId}/tickets`;
const AUDIT_LOG_COLLECTION = `artifacts/${appId}/audit_logs`; // NEW: Audit trail

// Helper functions for collection references
const getPublicEventsPath = () => collection(db, `${EVENTS_COLLECTION_BASE}/list`);
const getUserProfilesPath = () => collection(db, USERS_COLLECTION);
const getUserTicketsPath = (uid) => collection(db, `${TICKETS_COLLECTION_BASE}/${uid}/user_tickets`);
const getAuditLogsPath = () => collection(db, AUDIT_LOG_COLLECTION); // NEW: Audit logs

// --- SECURITY: Password validation function
const validatePassword = (password) => {
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*])(?=.{8,})/;
  return passwordRegex.test(password);
};

// Password validation error messages
const getPasswordErrorMessage = () => {
  return 'Password must be at least 8 characters with uppercase letter, lowercase letter, and special character (!@#$%^&*)';
};

// --- SECURITY: QR Code and Ticket ID encryption function
const encryptData = (data, encryptionKey) => {
  try {
    // Use a consistent encryption key derived from appId
    const key = encryptionKey || appId;
    return crypto.AES.encrypt(data, key).toString();
  } catch (err) {
    console.error('Encryption failed:', err);
    return data; // Fallback to unencrypted if encryption fails
  }
};

// --- SECURITY: QR Code and Ticket ID decryption function
const decryptData = (encryptedData, encryptionKey) => {
  try {
    const key = encryptionKey || appId;
    const bytes = crypto.AES.decrypt(encryptedData, key);
    return bytes.toString(crypto.enc.Utf8);
  } catch (err) {
    console.error('Decryption failed:', err);
    return encryptedData; // Fallback if decryption fails
  }
};

// --- SECURITY: Audit logging function
const logAuditEvent = async (action, userId, details, severity = 'INFO') => {
  try {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      action: action,
      userId: userId,
      details: details,
      severity: severity,
      userAgent: navigator.userAgent,
      // Note: In production, capture IP from server-side logging
    };
    
    // Log to console (in production, send to centralized logging service)
    console.log(`[AUDIT] ${JSON.stringify(auditEntry)}`);
    
    // Store in Firestore for persistent audit trail
    const auditRef = doc(getAuditLogsPath());
    await setDoc(auditRef, auditEntry);
  } catch (err) {
    console.error('Failed to log audit event:', err);
  }
};

// Helper functions
const generateAlternateId = () => Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
const generateQRCode = () => Math.random().toString(36).substring(2, 12).toUpperCase();

// --- FIREBASE SERVICE (API) ---
const firebaseApi = {
    // AUTHENTICATION
    async register(name, email, password) {
        // SECURITY: Validate password strength BEFORE attempting registration
        if (!validatePassword(password)) {
            throw new Error(getPasswordErrorMessage());
        }

        // 1. Create user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const defaultRole = 'buyer';

        // 2. Create profile document in Firestore
        await setDoc(doc(db, USERS_COLLECTION, user.uid), {
            name: name,
            username: email.split('@')[0],
            email: email,
            role: defaultRole,
            discount: 0.10,
            hasAccommodations: false,
            handicapAccessible: false,
            facultyRestricted: false,
            createdAt: new Date().toISOString()
        });

        // SECURITY: Log successful registration
        await logAuditEvent('USER_REGISTRATION', user.uid, { email: email }, 'INFO');

        return { message: 'Registration successful. Please log in.' };
    },

    async login(email, password) {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const uid = userCredential.user.uid;

            const docRef = doc(db, USERS_COLLECTION, uid);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                await signOut(auth);
                throw new Error("User profile not found. Contact admin.");
            }

            const data = docSnap.data();

            // SECURITY: Log successful login
            await logAuditEvent('USER_LOGIN', uid, { email: email }, 'INFO');

            return {
                ...data,
                id: uid,
                email: userCredential.user.email,
            };
        } catch (err) {
            // SECURITY: Log failed login attempt
            await logAuditEvent('LOGIN_FAILED', email, { error: err.message }, 'WARNING');
            throw err;
        }
    },

    async logout() {
        const currentUser = auth.currentUser;
        if (currentUser) {
            // SECURITY: Log logout event
            await logAuditEvent('USER_LOGOUT', currentUser.uid, {}, 'INFO');
        }
        await signOut(auth);
    },

    // EVENT CRUD (ADMIN)
    async createEvent(eventData, defaultSeats, adminUserId) {
        const newEventRef = doc(getPublicEventsPath());
        const eventId = newEventRef.id;

        await runTransaction(db, async (transaction) => {
            transaction.set(newEventRef, {
                ...eventData,
                id: eventId,
                booked_seats: 0,
                created_at: new Date().toISOString(),
                auditoriums: [{ id: 'aud-main', name: `${eventData.venue} Main Area`, seats: defaultSeats }]
            });
        });

        // SECURITY: Log admin event creation
        await logAuditEvent(
            'EVENT_CREATED',
            adminUserId,
            { eventId: eventId, eventName: eventData.name, venue: eventData.venue },
            'INFO'
        );

        return { message: `Event "${eventData.name}" created successfully.` };
    },

    async deleteEvent(eventId, eventName, adminUserId) {
        const eventRef = doc(getPublicEventsPath(), eventId);
        await deleteDoc(eventRef);

        // SECURITY: Log admin event deletion
        await logAuditEvent(
            'EVENT_DELETED',
            adminUserId,
            { eventId: eventId, eventName: eventName },
            'WARNING'
        );

        return { message: 'Event deleted successfully.' };
    },

    // USER DATA
    async getUsers() {
        const snapshot = await getDocs(getUserProfilesPath());
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    
    // TICKET ACTIONS
    async bookTicket(userId, eventId, seatId, finalPrice, originalPrice, discount) {
        const userTicketRef = doc(getUserTicketsPath(userId), seatId);
        const eventRef = doc(getPublicEventsPath(), eventId);

        await runTransaction(db, async (transaction) => {
            const eventDoc = await transaction.get(eventRef);
            if (!eventDoc.exists()) {
                throw new Error("Event not found.");
            }
            const eventData = eventDoc.data();
            
            let auditoriumIndex = -1;
            let seatIndex = -1;

            for (let i = 0; i < eventData.auditoriums.length; i++) {
                seatIndex = eventData.auditoriums[i].seats.findIndex(s => s.id === seatId);
                if (seatIndex !== -1) {
                    auditoriumIndex = i;
                    break;
                }
            }
            
            if (seatIndex === -1 || eventData.auditoriums[auditoriumIndex].seats[seatIndex].isBooked) {
                throw new Error("Seat is already booked or does not exist.");
            }
            
            eventData.auditoriums[auditoriumIndex].seats[seatIndex].isBooked = true;
            eventData.booked_seats = (eventData.booked_seats || 0) + 1;
            transaction.update(eventRef, { 
                auditoriums: eventData.auditoriums, 
                booked_seats: eventData.booked_seats 
            });

            // SECURITY: Encrypt QR code and Alternate ID before storage
            const rawQRCode = generateQRCode();
            const rawAlternateId = generateAlternateId();
            const encryptedQRCode = encryptData(rawQRCode);
            const encryptedAlternateId = encryptData(rawAlternateId);

            const seat = eventData.auditoriums[auditoriumIndex].seats[seatIndex];
            transaction.set(userTicketRef, {
                id: seatId,
                userId: userId,
                eventId: eventId,
                eventName: eventData.name,
                venue: eventData.venue,
                date: eventData.date,
                time: eventData.time,
                seatId: seatId,
                row: seat.row,
                column: seat.column,
                originalPrice: originalPrice,
                finalPrice: finalPrice,
                qrCode: encryptedQRCode,  // ENCRYPTED
                alternateId: encryptedAlternateId,  // ENCRYPTED
                isFacultyOnly: seat.isFacultyOnly,
                status: 'valid',
                created_at: new Date().toISOString()
            });
        });

        // SECURITY: Log ticket booking
        await logAuditEvent(
            'TICKET_BOOKED',
            userId,
            { eventId: eventId, seatId: seatId, finalPrice: finalPrice },
            'INFO'
        );

        return { message: 'Ticket booked successfully!' };
    },
    
    async returnTicket(ticketId, userId) {
        await logAuditEvent(
            'TICKET_RETURN_REQUESTED',
            userId,
            { ticketId: ticketId },
            'WARNING'
        );
        alert("Return/Refund simulated: Success (Requires full Firestore implementation).");
        return { message: 'Return simulated.' };
    },

    async transferTicket(ticketId, userId, targetEmail) {
        await logAuditEvent(
            'TICKET_TRANSFER_REQUESTED',
            userId,
            { ticketId: ticketId, targetEmail: targetEmail },
            'WARNING'
        );
        alert(`Transfer simulated to ${targetEmail}: Success (Requires full Firestore implementation).`);
        return { message: 'Transfer simulated.' };
    },

    async validateTicket(scanId, enforcerId) {
        await logAuditEvent(
            'TICKET_VALIDATION_ATTEMPTED',
            enforcerId,
            { scanId: scanId },
            'INFO'
        );
        alert("Validation simulated: Requires full Firestore implementation.");
        return { valid: false, message: 'Validation simulated.' };
    }
};


// --- STANDALONE COMPONENTS ---

const MyTickets = React.memo(({
  userTickets,
  transferTargetEmail,
  setTransferTargetEmail,
  setActiveTab,
  handleReturn,
  handleTransfer,
}) => (
  <div className="space-y-6">
    <h2 className="text-3xl font-bold text-white">My Tickets</h2>
    {userTickets.length === 0 ? (
      <div className="text-center py-16">
        <p className="text-xl text-gray-300 mb-4">No tickets yet</p>
        <button onClick={() => setActiveTab('events')} className="bg-blue-600 text-white px-6 py-3 rounded-lg">
          Browse Events
        </button>
      </div>
    ) : (
      <div className="grid gap-6 md:grid-cols-2">
        {userTickets.map(ticket => {
          // SECURITY: Decrypt QR code and Alternate ID for display
          const decryptedQRCode = decryptData(ticket.qrCode);
          const decryptedAlternateId = decryptData(ticket.alternateId);

          return (
            <div key={ticket.id} className="bg-gray-800 rounded-xl shadow-lg border border-gray-700">
              <div className="bg-gradient-to-r from-blue-700 to-purple-700 text-white p-4 rounded-t-xl">
                <h3 className="text-lg font-bold">{ticket.eventName}</h3>
              </div>
              <div className="p-6 bg-gray-900 rounded-b-xl">
                <div className="space-y-2 mb-6 text-gray-200">
                  <p><strong>Venue:</strong> {ticket.venue}</p>
                  <p><strong>Date:</strong> {ticket.date} at {ticket.time}</p>
                  <p><strong>Seat:</strong> Row {ticket.row}, Seat {ticket.column}</p>
                  <p className="text-lg font-bold border-t pt-2">Paid: ${ticket.finalPrice}</p>
                </div>
                <div className="bg-gray-800 p-6 rounded-lg mb-6 text-center">
                  <QrCode size={100} className="mx-auto mb-3 text-white" />
                  <p className="text-xs font-mono font-bold text-gray-200">QR: {decryptedQRCode}</p>
                  <p className="text-sm text-gray-400 mt-2">Alt ID: {decryptedAlternateId}</p>
                </div>
                
                <div className="space-y-4">
                  <div className="border border-gray-700 p-3 rounded-lg bg-yellow-900/10">
                    <p className="font-semibold text-sm mb-2 flex items-center gap-2 text-yellow-300">
                      <Send size={16} /> Transfer Ticket
                    </p>
                    <div className="flex space-x-2">
                      <input
                        type="email"
                        placeholder="Recipient's Email"
                        value={transferTargetEmail[ticket.id] || ''}
                        onChange={(e) => 
                          setTransferTargetEmail(prev => ({ ...prev, [ticket.id]: e.target.value }))
                        }
                        className="flex-grow p-2 border border-gray-700 rounded-lg text-sm bg-gray-700 text-white"
                      />
                      <button 
                        onClick={() => handleTransfer(ticket.id)} 
                        disabled={!transferTargetEmail[ticket.id] || !transferTargetEmail[ticket.id].includes('@')}
                        className="flex-shrink-0 bg-yellow-600 text-white px-3 py-2 rounded-lg hover:bg-yellow-700 font-medium text-sm disabled:opacity-50"
                      >
                        Transfer
                      </button>
                    </div>
                  </div>

                  <button 
                    onClick={() => handleReturn(ticket.id)} 
                    className="w-full bg-red-600 text-white py-3 rounded-lg hover:bg-red-700 font-medium"
                  >
                    Return Ticket & Get Refund (${ticket.finalPrice})
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
));


const TicketValidation = ({ currentUser }) => {
  const [scanId, setScanId] = useState('');
  const [validationResult, setValidationResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleValidation = async () => {
    setValidationResult(null);
    const id = scanId.trim();
    if (!id) return;

    setLoading(true);
    try {
      const result = await firebaseApi.validateTicket(id, currentUser.id);
      setValidationResult(result);
      setScanId('');
    } catch (error) {
      setValidationResult({ 
        valid: false, 
        status: 'invalid', 
        message: 'Error validating ticket. Please try again.' 
      });
    } finally {
      setLoading(false);
    }
  };

  const getResultStyle = (status) => {
    switch (status) {
      case 'valid': return 'bg-green-900/60 text-green-200 border-green-600';
      case 'used': return 'bg-yellow-900/50 text-yellow-200 border-yellow-600';
      case 'invalid': return 'bg-red-900/60 text-red-200 border-red-600';
      default: return 'bg-gray-800 text-gray-200 border-gray-700';
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-white">Ticket Validation</h2>
      <div className="bg-gray-900 rounded-xl shadow-lg p-6 max-w-lg mx-auto">
        <p className="text-lg font-semibold mb-4 text-gray-200">Scan QR Code or Enter Alternate ID</p>
        <div className="flex space-x-2 mb-4">
          <input 
            type="text" 
            value={scanId} 
            onChange={(e) => setScanId(e.target.value)} 
            placeholder="QR Code or Alt ID" 
            className="flex-grow p-3 border-2 rounded-lg text-lg bg-gray-800 text-white border-gray-700 focus:border-blue-500"
            onKeyPress={(e) => {if (e.key === 'Enter') handleValidation();}}
            disabled={loading}
          />
          <button 
            onClick={handleValidation} 
            className="flex-shrink-0 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
            disabled={!scanId.trim() || loading}
          >
            {loading ? 'Validating...' : 'Validate'}
          </button>
        </div>

        {validationResult && (
          <div className={`p-4 mt-6 border-l-4 rounded-lg ${getResultStyle(validationResult.status)}`}>
            <div className="flex items-center gap-3 mb-2">
              {validationResult.valid && <CheckCircle size={24} className="text-green-400" />}
              {!validationResult.valid && <XCircle size={24} className="text-red-400" />}
              <p className="text-xl font-bold">{validationResult.status?.toUpperCase()} TICKET</p>
            </div>
            <p className="font-semibold text-gray-100">{validationResult.message}</p>
            
            {validationResult.ticket && (
              <div className="mt-3 border-t pt-3 text-gray-200">
                <p><strong>Event:</strong> {validationResult.ticket.eventName}</p>
                <p><strong>Seat:</strong> Row {validationResult.ticket.row}, Seat {validationResult.ticket.column}</p>
                <p><strong>Entry Requirement:</strong> {validationResult.ticket.isFacultyOnly ? 
                  <span className="text-red-400 font-bold">Faculty Only Seat</span> : 'Standard'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// --- ADMIN MANAGEMENT COMPONENT ---
const AdminManagement = ({ loadEvents, events, currentUser }) => {
    const [allUsers, setAllUsers] = useState([]);
    const [view, setView] = useState('users'); 
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [newEvent, setNewEvent] = useState({
        name: '', venue: '', date: '', time: '19:00:00', capacity: 0, description: '', category: 'Sports'
    });
    
    const getBasketballSeatsTemplate = () => {
        const seats = [];
        for (let i = 0; i < 400; i++) {
            const row = Math.floor(i / 20) + 1;
            const col = (i % 20) + 1;
            const tier = i < 80 ? 'premium' : i < 240 ? 'standard' : 'economy';
            const price = i < 80 ? 85 : i < 240 ? 45 : 25;
            const isHandicap = i % 25 === 0;
            const isFaculty = (i % 30 === 0 && i < 60);
            
            seats.push({
                id: `seat-${i+1}`,
                row: row,
                column: col,
                tier: tier,
                price: price,
                isHandicap: isHandicap,
                isFacultyOnly: isFaculty,
                isBooked: false
            });
        }
        return seats;
    };

    useEffect(() => {
        if (view === 'users') {
            fetchUsers();
        }
    }, [view]);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const data = await firebaseApi.getUsers();
            setAllUsers(data);
        } catch (err) {
            console.error('Failed to fetch users:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateEvent = async () => {
        if (!newEvent.name || !newEvent.venue || !newEvent.date || !newEvent.capacity || newEvent.capacity <= 0) {
            alert('Please fill out all required event fields (Name, Venue, Date, Capacity > 0).');
            return;
        }
        setLoading(true);
        try {
            const defaultSeats = getBasketballSeatsTemplate(); 
            const result = await firebaseApi.createEvent(newEvent, defaultSeats, currentUser.id);
            alert(`Success: ${result.message}`);
            loadEvents(); 
            setNewEvent({ name: '', venue: '', date: '', time: '19:00:00', capacity: 0, description: '', category: 'Sports' });
            setView('events'); 
        } catch (err) {
            alert('Failed to create event. Check console for details.');
            console.error('Create event error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteEvent = async (eventId, eventName) => {
        if (!window.confirm(`WARNING: Are you sure you want to delete the event "${eventName}"? This will delete the event record and cannot be undone.`)) return;

        setLoading(true);
        try {
            const result = await firebaseApi.deleteEvent(eventId, eventName, currentUser.id);
            alert(`Success: ${result.message}`);
            loadEvents(); 
        } catch (err) {
            alert('Failed to delete event. Check console.');
            console.error('Delete event error:', err);
        } finally {
            setLoading(false);
        }
    };

    const filteredUsers = allUsers.filter(user => 
        user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const EventManagement = () => (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold text-white mb-4">Event Management</h3>
            
            <div className="bg-gray-800 p-6 rounded-xl shadow-lg">
                <h4 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                    <PlusCircle size={20} className="text-green-400" /> Create New Event
                </h4>
                <div className="grid grid-cols-2 gap-4">
                    <input type="text" placeholder="Name" value={newEvent.name} onChange={e => setNewEvent({...newEvent, name: e.target.value})} className="p-3 bg-gray-700 rounded text-white" />
                    <input type="text" placeholder="Venue" value={newEvent.venue} onChange={e => setNewEvent({...newEvent, venue: e.target.value})} className="p-3 bg-gray-700 rounded text-white" />
                    <input type="date" placeholder="Date" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})} className="p-3 bg-gray-700 rounded text-white" />
                    <input type="time" placeholder="Time" value={newEvent.time} onChange={e => setNewEvent({...newEvent, time: e.target.value})} className="p-3 bg-gray-700 rounded text-white" />
                    <input type="number" placeholder="Capacity (e.g., 5000)" value={newEvent.capacity} onChange={e => setNewEvent({...newEvent, capacity: parseInt(e.target.value) || 0})} className="p-3 bg-gray-700 rounded text-white" />
                    <select value={newEvent.category} onChange={e => setNewEvent({...newEvent, category: e.target.value})} className="p-3 bg-gray-700 rounded text-white">
                        <option value="Sports">Sports</option>
                        <option value="Theatre">Theatre</option>
                        <option value="Music">Music</option>
                        <option value="Other">Other</option>
                    </select>
                </div>
                <textarea placeholder="Description" value={newEvent.description} onChange={e => setNewEvent({...newEvent, description: e.target.value})} className="w-full mt-4 p-3 bg-gray-700 rounded text-white h-24"></textarea>
                <button onClick={handleCreateEvent} disabled={loading} className="w-full mt-4 bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 disabled:opacity-50">
                    {loading ? 'Creating...' : 'Create Event'}
                </button>
            </div>

            <h4 className="text-xl font-semibold text-white mb-2">Existing Events</h4>
            <div className="space-y-3">
                {events.map(event => (
                    <div key={event.id} className="bg-gray-800 p-4 rounded-lg flex items-center justify-between border border-gray-700">
                        <div className="flex-grow">
                            <p className="font-bold text-lg text-blue-400">{event.name}</p>
                            <p className="text-sm text-gray-400">{event.venue} - {event.date}</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => handleDeleteEvent(event.id, event.name)} className="p-2 bg-red-600 rounded-lg hover:bg-red-700" title="Delete Event" disabled={loading}>
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const UserManagement = () => (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold text-white mb-4">User Management</h3>
            <div className="flex items-center bg-gray-800 p-3 rounded-xl border border-gray-700">
                <Search size={20} className="text-gray-400 mr-3" />
                <input 
                    type="text" 
                    placeholder="Search users by name, username, or email..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="flex-grow p-1 bg-transparent text-white focus:outline-none"
                />
            </div>

            {loading ? (
                <p className="text-gray-400">Loading user list...</p>
            ) : (
                <div className="space-y-3">
                    {filteredUsers.map(user => (
                        <div key={user.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                            <div className="flex justify-between items-center mb-2">
                                <p className="font-bold text-xl text-white">{user.name}</p>
                                <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                                    user.role === 'admin' ? 'bg-red-800 text-red-100' :
                                    user.role === 'enforcer' ? 'bg-purple-800 text-purple-100' :
                                    'bg-blue-800 text-blue-100'
                                }`}>
                                    {user.role.toUpperCase()}
                                </span>
                            </div>
                            <div className="text-sm text-gray-400 space-y-1">
                                <p><strong>Username:</strong> {user.username}</p>
                                <p><strong>Email:</strong> {user.email}</p>
                                <p><strong>Joined:</strong> {new Date(user.createdAt).toLocaleDateString()}</p>
                                {user.role === 'buyer' && (
                                    <p>
                                        <strong>Accommodations:</strong> 
                                        {user.hasAccommodations ? 
                                            <span className="text-yellow-400 ml-1">Yes (Handicap: {user.handicapAccessible ? 'Y' : 'N'}, Faculty: {user.facultyRestricted ? 'Y' : 'N'})</span> : 
                                            ' No'
                                        }
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-white">Administrator Panel</h2>

            <div className="flex space-x-4 border-b border-gray-700 pb-2">
                <button 
                    onClick={() => setView('users')} 
                    className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                        view === 'users' ? 'bg-gray-700 text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:bg-gray-800'
                    }`}
                >
                    User Lookup ({allUsers.length})
                </button>
                <button 
                    onClick={() => setView('events')} 
                    className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                        view === 'events' ? 'bg-gray-700 text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:bg-gray-800'
                    }`}
                >
                    Event CRUD ({events.length})
                </button>
            </div>

            {view === 'users' ? <UserManagement /> : <EventManagement />}
        </div>
    );
};


// --- MAIN APP COMPONENT ---

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('events');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [userTickets, setUserTickets] = useState([]);
  const [events, setEvents] = useState([]);
  const [transferTargetEmail, setTransferTargetEmail] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isRegistering, setIsRegistering] = useState(false); 
  const [message, setMessage] = useState(null); 
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const docRef = doc(getUserProfilesPath(), user.uid);
                const docSnap = await getDoc(docRef);

                if (!docSnap.exists()) {
                    await firebaseApi.logout();
                    throw new Error("User profile not found. Contact admin.");
                }

                const profile = docSnap.data();
                setCurrentUser({
                    ...profile,
                    id: user.uid,
                    email: user.email,
                });
                
                if (profile.role === 'admin') setActiveTab('admin');
                else if (profile.role === 'enforcer') setActiveTab('validate');
                else setActiveTab('events');

            } catch (e) {
                console.error("Failed to load user profile:", e);
                setCurrentUser(null);
            }
        } else {
            setCurrentUser(null);
        }
        setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isAuthReady && (currentUser?.role === 'buyer' || currentUser?.role === 'admin')) {
      const q = getPublicEventsPath();
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const eventList = snapshot.docs.map(doc => ({
            ...doc.data(),
        })).sort((a, b) => new Date(a.date) - new Date(b.date));
        setEvents(eventList);
        setLoading(false);
      }, (err) => {
        console.error("Error fetching real-time events:", err);
        setError('Failed to load events in real-time.');
      });
      return () => unsubscribe();
    }
  }, [currentUser, isAuthReady]);

  useEffect(() => {
    if (currentUser?.role === 'buyer') {
      const q = getUserTicketsPath(currentUser.id);
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const ticketsList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        setUserTickets(ticketsList);
      }, (err) => {
        console.error("Error fetching user tickets:", err);
      });
      return () => unsubscribe();
    }
  }, [currentUser]);

  const loadEventDetails = async (event) => {
    setSelectedEvent(event);
  };

  const handleReturn = useCallback(async (ticketId) => {
    const ticket = userTickets.find(t => t.id === ticketId);
    if (!ticket) return;

    if (window.confirm(`Return ticket for ${ticket.eventName}?\n\nSeat: Row ${ticket.row}, Seat ${ticket.column}\nRefund: ${ticket.finalPrice}\n\nRefund will be processed in 1-2 business days.`)) {
      try {
        await firebaseApi.returnTicket(ticket.id, currentUser.id);
        alert(`Ticket return simulated! Refund of ${ticket.finalPrice} will be processed.`);
      } catch (err) {
        alert('Failed to return ticket. Check console.');
      }
    }
  }, [userTickets, currentUser]);

  const handleTransfer = useCallback(async (ticketId) => {
    const email = transferTargetEmail[ticketId];
    if (!email || !email.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }

    const ticket = userTickets.find(t => t.id === ticketId);
    if (!ticket) return;

    if (window.confirm(`CONFIRM TRANSFER:\n\nTransfer ticket for ${ticket.eventName} to ${email}? This action cannot be undone.`)) {
      try {
        await firebaseApi.transferTicket(ticket.id, currentUser.id, email);
        setTransferTargetEmail(prev => {
          const newState = { ...prev };
          delete newState[ticketId];
          return newState;
        });
      } catch (err) {
        alert('Failed to transfer ticket. Check console.');
      }
    }
  }, [userTickets, transferTargetEmail, currentUser]);

  const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState(false);

    const handleLogin = async () => {
      setLoginError(false);
      setMessage(null);

      if (!email || !password) {
        setLoginError(true);
        return;
      }

      try {
        setLoading(true);
        await firebaseApi.login(email, password); 
      } catch (err) {
        setLoginError(true);
        console.error("Login failed:", err.code || err.message); 
      } finally {
        setLoading(false);
      }
    };
    
    const RegistrationForm = () => {
        const [regName, setRegName] = useState('');
        const [regEmail, setRegEmail] = useState('');
        const [regPassword, setRegPassword] = useState('');
        const [regError, setRegError] = useState(null);
        const [regLoading, setRegLoading] = useState(false);

        const emailRegex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;

        const handleRegister = async () => {
            setRegError(null);
            setMessage(null);

            if (!regName || !regPassword || !regEmail) {
                setRegError('All fields are required.');
                return;
            }
            // SECURITY: Enforce password requirements (8+ chars, uppercase, lowercase, special char)
            if (!validatePassword(regPassword)) {
                setRegError(getPasswordErrorMessage());
                return;
            }
            if (!regEmail.match(emailRegex)) {
                setRegError('Please enter a valid email address.');
                return;
            }
            
            setRegLoading(true);
            try {
                const data = await firebaseApi.register(regName, regEmail, regPassword);
                setMessage({ type: 'success', text: data.message || 'Registration successful. You can now log in.' });
                
                setRegName('');
                setRegEmail('');
                setRegPassword('');
                setIsRegistering(false); 
            } catch (err) {
                setRegError(err.message || 'Registration failed. Check if email is already in use.');
                console.error('Registration failed:', err.message);
            } finally {
                setRegLoading(false);
            }
        };

        return (
            <div className="space-y-4">
                <h2 className="text-2xl font-bold text-center text-white">Sign Up (New Buyer Account)</h2>
                {regError && (
                    <p className="text-red-500 font-semibold text-center bg-red-900/20 p-2 rounded border border-red-500">
                        {regError}
                    </p>
                )}
                
                <input type="text" value={regName} onChange={e => setRegName(e.target.value)} placeholder="Full Name" className="w-full p-3 border border-gray-700 rounded-lg bg-gray-700 text-white" />
                <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="Email Address (e.g., user@cofc.edu)" className="w-full p-3 border border-gray-700 rounded-lg bg-gray-700 text-white" />
                <input type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} placeholder="Password (8+ chars, uppercase, lowercase, special char !@#$%^&*)" className="w-full p-3 border border-gray-700 rounded-lg bg-gray-700 text-white" />
                
                <button onClick={handleRegister} disabled={regLoading} className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 disabled:opacity-50">
                    {regLoading ? 'Signing Up...' : 'Sign Up'}
                </button>
                <p className="text-center text-sm text-gray-400">
                    Already have an account? <button onClick={() => setIsRegistering(false)} className="text-blue-400 hover:underline">Log In</button>
                </p>
            </div>
        );
    };

    const LoginForm = () => (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold text-center text-white">Log In</h2>
            {message && (
                <div className={`p-2 rounded border ${
                    message.type === 'success' ? 'bg-green-900/20 border-green-500 text-green-500' : 'bg-red-900/20 border-red-500 text-red-500'
                }`}>
                    {message.text}
                </div>
            )}
            {loginError && (
              <p className="text-red-500 font-semibold text-center bg-red-900/20 p-2 rounded border border-red-500">
                Invalid Email or Password.
              </p>
            )}
            
            <input 
              type="email" 
              value={email} 
              onChange={(e) => {setEmail(e.target.value); setLoginError(false);}}
              placeholder="Email" 
              className="w-full p-3 border border-gray-700 rounded-lg bg-gray-700 text-white" 
            />
            <input 
              type="password" 
              value={password} 
              onChange={(e) => {setPassword(e.target.value); setLoginError(false);}}
              placeholder="Password" 
              className="w-full p-3 border border-gray-700 rounded-lg bg-gray-700 text-white" 
            />
            <button onClick={handleLogin} disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Logging In...' : 'Log In'}
            </button>
            <p className="text-center text-sm text-gray-400">
                Don't have an account? <button onClick={() => setIsRegistering(true)} className="text-green-400 hover:underline">Sign Up</button>
            </p>
        </div>
    );

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-2xl shadow-xl p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-center mb-6 text-white">Box Office Dragon</h1>
          {isRegistering ? <RegistrationForm /> : <LoginForm />}
          
          <div className="mt-6 text-sm text-gray-500 text-center border-t border-gray-700 pt-4">
            <p>Admin/Enforcer accounts must be manually created and configured in Firebase.</p>
            <p className="mt-1">New Sign Ups automatically become **Buyer** accounts (10% discount).</p>
          </div>
        </div>
      </div>
    );
  };

  const EventList = () => (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-white">Available Events</h2>
      {loading ? (
        <p className="text-gray-400">Loading events...</p>
      ) : error ? (
        <p className="text-red-400">{error}</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {events.map(event => (
            <div 
              key={event.id} 
              className="bg-gray-800 text-white rounded-xl shadow-lg p-6 cursor-pointer hover:bg-gray-700" 
              onClick={() => loadEventDetails(event)}
            >
              <h3 className="text-xl font-bold mb-3">{event.name}</h3>
              <div className="space-y-2 text-sm mb-4">
                <div className="flex items-center gap-2"><MapPin size={16} /><span>{event.venue}</span></div>
                <div className="flex items-center gap-2"><Calendar size={16} /><span>{event.date} at {event.time}</span></div>
                <div className="flex items-center gap-2"><Users size={16} /><span>{Math.round((event.booked_seats / event.capacity) * 100)}% full</span></div>
              </div>
              <p className="text-gray-300 text-sm">{event.description}</p>
              <div className="mt-4 h-2 bg-gray-700 rounded">
                <div className="h-2 bg-blue-500 rounded" style={{ width: `${(event.booked_seats / event.capacity) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const SeatSelection = () => {
    if (!selectedEvent) return <EventList />;

    const isAdmin = currentUser.role === 'admin';
    const canBook = !isAdmin;

    const handleSeatSelect = (seat) => {
      if (seat.isBooked || !canBook) return;
      setSelectedSeat(seat);
    };

    const getSeatColor = (seat) => {
      if (seat.isBooked) return 'bg-gray-600 cursor-not-allowed';
      if (seat.id === selectedSeat?.id) return 'bg-green-500';
      if (seat.tier === 'premium') return 'bg-yellow-400';
      if (seat.tier === 'standard') return 'bg-blue-400';
      return 'bg-green-400';
    };

    const bookSeat = async () => {
      if (!canBook) return alert("Administrators cannot purchase tickets.");

      const discount = currentUser.discount || 0.0;
      const originalPrice = selectedSeat.price;
      const finalPrice = (originalPrice * (1 - discount)).toFixed(2);
      
      try {
        setLoading(true);
        await firebaseApi.bookTicket(
            currentUser.id, 
            selectedEvent.id, 
            selectedSeat.id, 
            parseFloat(finalPrice), 
            originalPrice, 
            discount
        );
        setSelectedSeat(null);
        alert('Ticket booked successfully! State should update shortly.');
      } catch (err) {
        alert('Failed to book ticket. The seat may no longer be available. Reload the page.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    const seats = selectedEvent.auditoriums?.[0]?.seats || []; 

    return (
      <div className="space-y-6">
        <button onClick={() => {setSelectedEvent(null); setSelectedSeat(null);}} className="text-blue-400">
          ← Back
        </button>
        <h2 className="text-2xl font-bold text-white">{selectedEvent.name}</h2>

        {isAdmin && <p className="text-red-400 font-bold mb-4">NOTE: Admin accounts cannot purchase tickets.</p>}
        
        {selectedEvent.auditoriums?.map(aud => (
          <div key={aud.id} className="bg-gray-900 text-white rounded-xl shadow-lg p-6">
            <div className="text-center mb-6 bg-gray-800 text-white py-3 rounded-lg">STAGE</div>
            <div className="grid gap-1 justify-center" style={{gridTemplateColumns: 'repeat(20, 1fr)'}}>
              {aud.seats?.map(seat => (
                <button 
                  key={seat.id} 
                  onClick={() => handleSeatSelect(seat)} 
                  disabled={seat.isBooked || !canBook}
                  className={`w-7 h-7 text-xs rounded ${getSeatColor(seat)}`}
                >
                  {seat.column}
                </button>
              ))}
            </div>
            {selectedSeat && canBook && (
              <div className="mt-6 p-4 bg-gray-800 rounded-lg">
                <p>Row {selectedSeat.row}, Seat {selectedSeat.column}</p>
                <p>Price: ${selectedSeat.price}</p>
                {currentUser.role === 'buyer' && currentUser.discount > 0 && (
                  <p className="text-green-400">Discount: -${(selectedSeat.price * currentUser.discount).toFixed(2)}</p>
                )}
                <p className="font-bold">
                  Final: ${currentUser.role === 'buyer' ? 
                    (selectedSeat.price * (1 - currentUser.discount)).toFixed(2) : 
                    selectedSeat.price}
                </p>
                <button 
                  onClick={bookSeat} 
                  disabled={loading}
                  className="mt-3 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? 'Booking...' : 'Book Seat'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (!isAuthReady) return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Loading Authentication...</div>;
  if (!currentUser) return <Login />;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-900 text-white shadow-md border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold">Box Office Dragon</h1>
          <div className="flex gap-4">
            {currentUser.role === 'admin' && (
                <button onClick={() => setActiveTab('admin')} className={`px-4 py-2 rounded ${activeTab === 'admin' ? 'bg-gray-800' : ''}`}>
                  Admin Management
                </button>
            )}
            
            {(currentUser.role === 'buyer' || currentUser.role === 'admin') && (
              <button onClick={() => {setActiveTab('events'); setSelectedEvent(null);}} className={`px-4 py-2 rounded ${activeTab === 'events' ? 'bg-gray-800' : ''}`}>
                Events
              </button>
            )}
            
            {currentUser.role === 'buyer' && (
              <button onClick={() => setActiveTab('tickets')} className={`px-4 py-2 rounded ${activeTab === 'tickets' ? 'bg-gray-800' : ''}`}>
                My Tickets
              </button>
            )}

            {currentUser.role === 'enforcer' && (
              <button onClick={() => setActiveTab('validate')} className={`px-4 py-2 rounded ${activeTab === 'validate' ? 'bg-gray-800' : ''}`}>
                Validate Tickets
              </button>
            )}
            <button onClick={() => firebaseApi.logout()} className="text-red-400">Logout</button>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'admin' && currentUser.role === 'admin' && <AdminManagement loadEvents={() => {}} events={events} currentUser={currentUser} />}
        {activeTab === 'events' && <SeatSelection />}
        {activeTab === 'tickets' && currentUser.role === 'buyer' && (
          <MyTickets 
            userTickets={userTickets}
            transferTargetEmail={transferTargetEmail}
            setTransferTargetEmail={setTransferTargetEmail}
            setActiveTab={setActiveTab}
            handleReturn={handleReturn}
            handleTransfer={handleTransfer}
          />
        )}
        {activeTab === 'validate' && currentUser.role === 'enforcer' && (
          <TicketValidation currentUser={currentUser} />
        )}
      </div>
    </div>
  );
}

export default App;