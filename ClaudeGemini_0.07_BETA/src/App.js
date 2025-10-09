import React, { useState, useCallback, useEffect } from 'react';
import { Calendar, MapPin, QrCode, Users, Send, CheckCircle, XCircle, Trash2, Search, PlusCircle, Edit } from 'lucide-react';

// API Configuration
const API_BASE_URL = 'http://localhost:5000/api';

// API Service
const api = {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Request failed');
      return data;
    } catch (error) {
      console.error(`API Error (${endpoint}):`, error);
      throw error;
    }
  },

  login: (username, password) => 
    api.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  getEvents: () => api.request('/events'),
  
  getEvent: (eventId) => api.request(`/events/${eventId}`),

  bookTicket: (userId, eventId, seatId) =>
    api.request('/tickets/book', {
      method: 'POST',
      body: JSON.stringify({ userId, eventId, seatId }),
    }),

  getUserTickets: (userId) => api.request(`/tickets/user/${userId}`),

  returnTicket: (ticketId, userId) =>
    api.request('/tickets/return', {
      method: 'POST',
      body: JSON.stringify({ ticketId, userId }),
    }),

  transferTicket: (ticketId, userId, targetEmail) =>
    api.request('/tickets/transfer', {
      method: 'POST',
      body: JSON.stringify({ ticketId, userId, targetEmail }),
    }),

  validateTicket: (scanId, enforcerId) =>
    api.request('/tickets/validate', {
      method: 'POST',
      body: JSON.stringify({ scanId, enforcerId }),
    }),
    
  // --- ADMIN API FUNCTIONS ---
  getUsers: () => api.request('/admin/users'),

  createEvent: (eventData) => 
    api.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify(eventData),
    }),

  deleteEvent: (eventId) => 
    api.request(`/admin/events/${eventId}`, {
      method: 'DELETE',
    }),
    // NOTE: Update event functionality would be added here
};

// Components (Rest of the file)

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
        {userTickets.map(ticket => (
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
                <p className="text-xs font-mono font-bold text-gray-200">QR: {ticket.qrCode}</p>
                <p className="text-sm text-gray-400 mt-2">Alt ID: {ticket.alternateId}</p>
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
        ))}
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
      const result = await api.validateTicket(id, currentUser.id);
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

// --- NEW ADMIN COMPONENT ---

const AdminManagement = ({ loadEvents }) => {
    const [allUsers, setAllUsers] = useState([]);
    const [view, setView] = useState('users'); // 'users' or 'events'
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [newEvent, setNewEvent] = useState({
        name: '', venue: '', date: '', time: '19:00:00', capacity: 0, description: '', category: 'Sports'
    });
    
    useEffect(() => {
        if (view === 'users') {
            fetchUsers();
        }
    }, [view]);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const data = await api.getUsers();
            setAllUsers(data.users);
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
            const result = await api.createEvent(newEvent);
            alert(`Success: ${result.message}`);
            // Reload the events list in the main App component
            await loadEvents(); 
            // Reset form
            setNewEvent({ name: '', venue: '', date: '', time: '19:00:00', capacity: 0, description: '', category: 'Sports' });
            setView('events'); 
        } catch (err) {
            alert('Failed to create event. Check server logs.');
            console.error('Create event error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteEvent = async (eventId, eventName) => {
        if (!window.confirm(`WARNING: Are you sure you want to delete the event "${eventName}"? This will delete all associated seats and tickets and cannot be undone.`)) return;

        setLoading(true);
        try {
            const result = await api.deleteEvent(eventId);
            alert(`Success: ${result.message}`);
            await loadEvents(); 
        } catch (err) {
            alert('Failed to delete event. Check server logs.');
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
                            {/* <button className="p-2 bg-yellow-600 rounded-lg hover:bg-yellow-700" title="Edit Event"><Edit size={18} /></button> */}
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
                            {/* NOTE: Add buttons for Edit/Reset Password here for a full implementation */}
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

  // Load data based on user role and login status
  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === 'buyer' || currentUser.role === 'admin') {
        loadEvents();
      }
      if (currentUser.role === 'buyer') {
        loadUserTickets();
      }
    }
  }, [currentUser]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const data = await api.getEvents();
      setEvents(data.events);
    } catch (err) {
      setError('Failed to load events');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadUserTickets = async () => {
    if (!currentUser || currentUser.role !== 'buyer') return;
    try {
      const data = await api.getUserTickets(currentUser.id);
      setUserTickets(data.tickets);
    } catch (err) {
      console.error('Failed to load tickets:', err);
    }
  };

  const loadEventDetails = async (eventId) => {
    try {
      setLoading(true);
      const data = await api.getEvent(eventId);
      setSelectedEvent(data.event);
    } catch (err) {
      setError('Failed to load event details');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReturn = useCallback(async (ticketId) => {
    const ticket = userTickets.find(t => t.id === ticketId);
    if (!ticket) return;

    if (window.confirm(`Return ticket for ${ticket.eventName}?\n\nSeat: Row ${ticket.row}, Seat ${ticket.column}\nRefund: $${ticket.finalPrice}\n\nRefund will be processed in 1-2 business days.`)) {
      try {
        await api.returnTicket(ticketId, currentUser.id);
        await loadUserTickets();
        await loadEvents();
        if (selectedEvent) await loadEventDetails(selectedEvent.id);
        alert(`Ticket returned! Refund of $${ticket.finalPrice} will be processed within 1-2 business days.`);
      } catch (err) {
        alert('Failed to return ticket. Please try again.');
        console.error(err);
      }
    }
  }, [userTickets, currentUser, selectedEvent]);

  const handleTransfer = useCallback(async (ticketId) => {
    const email = transferTargetEmail[ticketId];
    if (!email || !email.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }

    const ticket = userTickets.find(t => t.id === ticketId);
    if (!ticket) return;

    if (window.confirm(`CONFIRM TRANSFER:\n\nTransfer ticket for ${ticket.eventName} to ${email}?\n\nThis action cannot be undone.`)) {
      try {
        await api.transferTicket(ticketId, currentUser.id, email);
        await loadUserTickets();
        setTransferTargetEmail(prev => {
          const newState = { ...prev };
          delete newState[ticketId];
          return newState;
        });
        alert(`Ticket transferred to ${email}! Confirmation email sent.`);
      } catch (err) {
        alert('Failed to transfer ticket. Please try again.');
        console.error(err);
      }
    }
  }, [userTickets, transferTargetEmail, currentUser]);

  const Login = () => {
    const [userType, setUserType] = useState('buyer');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState(false);

    const handleLogin = async () => {
      setLoginError(false);

      if (!username || !password) {
        setLoginError(true);
        return;
      }

      try {
        const data = await api.login(username, password);
        setCurrentUser(data.user);
        if (data.user.role === 'admin') setActiveTab('admin');
        else if (data.user.role === 'enforcer') setActiveTab('validate');
        else setActiveTab('events');
      } catch (err) {
        setLoginError(true);
      }
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-2xl shadow-xl p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-center mb-6 text-white">Box Office Dragon</h1>
          <div className="space-y-4">
            {loginError && (
              <p className="text-red-500 font-semibold text-center bg-red-900/20 p-2 rounded border border-red-500">
                Username or password incorrect.
              </p>
            )}
            
            <select value={userType} onChange={(e) => setUserType(e.target.value)} className="w-full p-3 border border-gray-700 rounded-lg bg-gray-700 text-white">
              <option value="buyer">Buyer</option>
              <option value="admin">Admin</option>
              <option value="enforcer">Enforcer</option>
            </select>
            <input 
              type="text" 
              value={username} 
              onChange={(e) => {setUsername(e.target.value); setLoginError(false);}}
              placeholder="Username" 
              className="w-full p-3 border border-gray-700 rounded-lg bg-gray-700 text-white" 
            />
            <input 
              type="password" 
              value={password} 
              onChange={(e) => {setPassword(e.target.value); setLoginError(false);}}
              placeholder="Password" 
              className="w-full p-3 border border-gray-700 rounded-lg bg-gray-700 text-white" 
            />
            <button onClick={handleLogin} className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700">
              Login
            </button>
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
              onClick={() => loadEventDetails(event.id)}
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

    // Restrict seat booking if the current user is an admin
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

      try {
        setLoading(true);
        const result = await api.bookTicket(currentUser.id, selectedEvent.id, selectedSeat.id);
        await loadUserTickets();
        await loadEventDetails(selectedEvent.id);
        setSelectedSeat(null);
        alert('Ticket booked successfully!');
      } catch (err) {
        alert('Failed to book ticket. The seat may no longer be available.');
        console.error(err);
        await loadEventDetails(selectedEvent.id);
      } finally {
        setLoading(false);
      }
    };

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
                  disabled={seat.isBooked || !canBook} // Disable if admin
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

  if (!currentUser) return <Login />;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-900 text-white shadow-md border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold">Box Office Dragon</h1>
          <div className="flex gap-4">
            {/* Conditional tabs based on user role */}
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
            <button onClick={() => setCurrentUser(null)} className="text-red-400">Logout</button>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'admin' && currentUser.role === 'admin' && <AdminManagement loadEvents={loadEvents} events={events} />}
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


