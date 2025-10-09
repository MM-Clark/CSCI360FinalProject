import React, { useState, useCallback, useEffect } from 'react';
import { Calendar, MapPin, QrCode, Users, Send, CheckCircle, XCircle } from 'lucide-react';

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
};

// Components
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

  // Load events when user logs in
  useEffect(() => {
    if (currentUser && (currentUser.role === 'buyer' || currentUser.role === 'admin')) {
      loadEvents();
      loadUserTickets();
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
    if (!currentUser) return;
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
        if (data.user.role === 'enforcer') setActiveTab('validate');
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

    const handleSeatSelect = (seat) => {
      if (seat.isBooked) return;
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
        {selectedEvent.auditoriums?.map(aud => (
          <div key={aud.id} className="bg-gray-900 text-white rounded-xl shadow-lg p-6">
            <div className="text-center mb-6 bg-gray-800 text-white py-3 rounded-lg">STAGE</div>
            <div className="grid gap-1 justify-center" style={{gridTemplateColumns: 'repeat(20, 1fr)'}}>
              {aud.seats?.map(seat => (
                <button 
                  key={seat.id} 
                  onClick={() => handleSeatSelect(seat)} 
                  disabled={seat.isBooked}
                  className={`w-7 h-7 text-xs rounded ${getSeatColor(seat)}`}
                >
                  {seat.column}
                </button>
              ))}
            </div>
            {selectedSeat && (
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
            {(currentUser.role === 'buyer' || currentUser.role === 'admin') && (
              <>
                <button onClick={() => {setActiveTab('events'); setSelectedEvent(null);}} className={`px-4 py-2 rounded ${activeTab === 'events' ? 'bg-gray-800' : ''}`}>
                  Events
                </button>
                <button onClick={() => setActiveTab('tickets')} className={`px-4 py-2 rounded ${activeTab === 'tickets' ? 'bg-gray-800' : ''}`}>
                  My Tickets
                </button>
              </>
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
        {activeTab === 'events' && <SeatSelection />}
        {activeTab === 'tickets' && (
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