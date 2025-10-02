import React, { useState, useCallback, useEffect } from 'react';
import { User, Calendar, MapPin, QrCode, Users, Send, CheckCircle, XCircle } from 'lucide-react'; 

const mockEvents = [
  {
    id: 1,
    name: 'Cougar Basketball vs Citadel',
    venue: 'TD Arena',
    date: '2025-11-25',
    time: '19:00',
    capacity: 5100,
    bookedSeats: 1122,
    description: 'CofC Cougars take on The Citadel Bulldogs.',
    category: 'Sports',
    auditoriums: [{
      id: 1,
      name: 'Main Court',
      seats: Array.from({ length: 400 }, (_, i) => ({
        id: i + 1,
        row: Math.floor(i / 20) + 1,
        column: (i % 20) + 1,
        tier: i < 80 ? 'premium' : i < 240 ? 'standard' : 'economy',
        price: i < 80 ? 85 : i < 240 ? 45 : 25,
        isHandicap: i % 25 === 0,
        isFacultyOnly: i % 30 === 0 && i < 60,
        isBooked: Math.random() < 0.22
      }))
    }]
  },
  {
    id: 2,
    name: 'Theatre: The Tempest',
    venue: 'Emmett Robinson Theatre',
    date: '2025-12-05',
    time: '19:30',
    capacity: 240,
    bookedSeats: 156,
    description: 'Shakespeare\'s final play performed by CofC Theatre students',
    auditoriums: [
      {
        id: 2,
        name: 'Main Theatre',
        seats: Array.from({ length: 240 }, (_, i) => ({
          id: i + 1,
          row: Math.floor(i / 15) + 1,
          column: (i % 15) + 1,
          tier: i < 45 ? 'premium' : i < 150 ? 'standard' : 'economy',
          price: i < 45 ? 35 : i < 150 ? 25 : 15,
          isHandicap: i % 20 === 0,
          isFacultyOnly: i % 25 === 0 && i < 45,
          isBooked: Math.random() < 0.65
        }))
      }
    ]
  },
  {
    id: 3,
    name: 'Jazz Ensemble Concert',
    venue: 'Recital Hall',
    date: '2025-11-29',
    time: '20:00',
    capacity: 150,
    bookedSeats: 67,
    description: 'CofC Jazz Ensemble presents an evening of contemporary and classic jazz',
    auditoriums: [
      {
        id: 3,
        name: 'Concert Hall',
        seats: Array.from({ length: 150 }, (_, i) => ({
          id: i + 1,
          row: Math.floor(i / 12) + 1,
          column: (i % 12) + 1,
          tier: i < 36 ? 'premium' : i < 96 ? 'standard' : 'economy',
          price: i < 36 ? 30 : i < 96 ? 20 : 12,
          isHandicap: i % 15 === 0,
          isFacultyOnly: i % 20 === 0 && i < 40,
          isBooked: Math.random() < 0.45
        }))
      }
    ]
  },
  {
    id: 4,
    name: 'Violin Ensemble Concert',
    venue: 'Recital Hall',
    date: '2025-11-30',
    time: '20:00',
    capacity: 150,
    bookedSeats: 84,
    description: 'CofC Violin Ensemble presents an evening of contemporary and classic violin',
    auditoriums: [
      {
        id: 4,
        name: 'Concert Hall',
        seats: Array.from({ length: 150 }, (_, i) => ({
          id: i + 1,
          row: Math.floor(i / 12) + 1,
          column: (i % 12) + 1,
          tier: i < 36 ? 'premium' : i < 96 ? 'standard' : 'economy',
          price: i < 36 ? 30 : i < 96 ? 20 : 12,
          isHandicap: i % 15 === 0,
          isFacultyOnly: i % 20 === 0 && i < 40,
          isBooked: Math.random() < 0.45
        }))
      }
    ]
  },
  {
    id: 5,
    name: 'Cougar Volleyball vs Charleston Southern',
    venue: 'TD Arena',
    date: '2026-01-26',
    time: '19:00',
    capacity: 5100,
    bookedSeats: 688,
    description: 'CofC Cougars take on Charleston Southern.',
    category: 'Sports',
    auditoriums: [{
      id: 5,
      name: 'Main Court',
      seats: Array.from({ length: 400 }, (_, i) => ({
        id: i + 1,
        row: Math.floor(i / 20) + 1,
        column: (i % 20) + 1,
        tier: i < 80 ? 'premium' : i < 240 ? 'standard' : 'economy',
        price: i < 80 ? 85 : i < 240 ? 45 : 25,
        isHandicap: i % 25 === 0,
        isFacultyOnly: i % 30 === 0 && i < 60,
        isBooked: Math.random() < 0.22
      }))
    }]
  },
  {
    id: 6,
    name: 'Cougar Basketball vs Charleston Southern',
    venue: 'TD Arena',
    date: '2026-01-28',
    time: '19:00',
    capacity: 5100,
    bookedSeats: 688,
    description: 'CofC Cougars take on Charleston Southern.',
    category: 'Sports',
    auditoriums: [{
      id: 6,
      name: 'Main Court',
      seats: Array.from({ length: 400 }, (_, i) => ({
        id: i + 1,
        row: Math.floor(i / 20) + 1,
        column: (i % 20) + 1,
        tier: i < 80 ? 'premium' : i < 240 ? 'standard' : 'economy',
        price: i < 80 ? 85 : i < 240 ? 45 : 25,
        isHandicap: i % 25 === 0,
        isFacultyOnly: i % 30 === 0 && i < 60,
        isBooked: Math.random() < 0.22
      }))
    }]
  }
];

// Dummy accounts for testing
const dummyAccounts = [
  {
    id: 'admin001',
    name: 'Sarah Chen',
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    email: 'admin@cofc.edu',
    discount: 0,
    specialAccommodations: null,
    createdAt: '2024-01-15T10:00:00.000Z'
  },
  {
    id: 'enforcer001',
    name: 'Marcus Williams',
    username: 'enforcer',
    password: 'enforcer123',
    role: 'enforcer',
    email: 'enforcer@cofc.edu',
    discount: 0,
    specialAccommodations: null,
    createdAt: '2024-02-20T14:30:00.000Z'
  },
  {
    id: 'student001',
    name: 'Emily Rodriguez',
    username: 'student',
    password: 'student123',
    role: 'buyer',
    email: 'student@cofc.edu',
    discount: 0.1,
    specialAccommodations: {
      hasAccommodations: false,
      handicapAccessible: false,
      facultyRestricted: false
    },
    createdAt: '2024-03-10T09:15:00.000Z'
  }
];

// -------------------------------------------------------------------------
// STANDALONE COMPONENTS (Extracted and Memoized for Performance)
// -------------------------------------------------------------------------

const MyTickets = React.memo(({
  userTickets,
  transferTargetEmail,
  setTransferTargetEmail,
  setActiveTab,
  handleReturn,
  handleTransfer,
}) => {
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-white">My Tickets</h2>
      {userTickets.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-xl text-gray-300 mb-4">No tickets yet</p>
          <button onClick={() => setActiveTab('events')} className="bg-blue-600 text-white px-6 py-3 rounded-lg">Browse Events</button>
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
                
                {/* TICKET ACTIONS */}
                <div className="space-y-4">
                  {/* Transfer Functionality */}
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

                  {/* Return Button */}
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
  );
});

const TicketValidation = ({ allTickets, setAllTickets }) => {
  const [scanId, setScanId] = useState('');
  const [validationResult, setValidationResult] = useState(null);

  const handleValidation = () => {
    setValidationResult(null); 

    const id = scanId.toUpperCase().trim();
    if (!id) return;

    const ticket = allTickets.find(
      t => t.qrCode === id || t.alternateId === id
    );

    if (!ticket) {
      setValidationResult({ status: 'invalid', message: 'Ticket ID not found.' });
      return;
    }

    if (ticket.status === 'used') {
      setValidationResult({ status: 'used', ticket, message: 'Ticket already scanned and used for entry.' });
      return;
    }

    if (ticket.status === 'invalid') {
      setValidationResult({ status: 'invalid', ticket, message: 'Ticket has been returned/cancelled and is no longer valid.' });
      return;
    }

    // Successful validation - mark as used
    setAllTickets(prevTickets => prevTickets.map(t => t.id === ticket.id ? { ...t, status: 'used' } : t));
    
    setValidationResult({ status: 'valid', ticket, message: 'SUCCESS! Ticket is VALID. Entry granted.' });
  };

  const getResultStyle = (status) => {
    switch (status) {
      case 'valid':
        return 'bg-green-900/60 text-green-200 border-green-600';
      case 'used':
        return 'bg-yellow-900/50 text-yellow-200 border-yellow-600';
      case 'invalid':
        return 'bg-red-900/60 text-red-200 border-red-600';
      default:
        return 'bg-gray-800 text-gray-200 border-gray-700';
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
          />
          <button 
            onClick={handleValidation} 
            className="flex-shrink-0 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium"
            disabled={!scanId.trim()}
          >
            Validate
          </button>
        </div>

        {validationResult && (
          <div className={`p-4 mt-6 border-l-4 rounded-lg ${getResultStyle(validationResult.status)}`}>
            <div className="flex items-center gap-3 mb-2">
              {validationResult.status === 'valid' && <CheckCircle size={24} className="text-green-400" />}
              {(validationResult.status === 'invalid' || validationResult.status === 'used') && <XCircle size={24} className="text-red-400" />}
              <p className="text-xl font-bold">{validationResult.status.toUpperCase()} TICKET</p>
            </div>
            <p className="font-semibold text-gray-100">{validationResult.message}</p>
            
            {validationResult.ticket && (
              <div className="mt-3 border-t pt-3 text-gray-200">
                <p><strong>Event:</strong> {validationResult.ticket.eventName}</p>
                <p><strong>Seat:</strong> Row {validationResult.ticket.row}, Seat {validationResult.ticket.column}</p>
                <p><strong>Entry Requirement:</strong> {validationResult.ticket.isFacultyOnly ? <span className="text-red-400 font-bold">Faculty Only Seat</span> : 'Standard'}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// -------------------------------------------------------------------------
// MAIN APP COMPONENT
// -------------------------------------------------------------------------

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('events'); 
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [allTickets, setAllTickets] = useState([]); 
  const [userTickets, setUserTickets] = useState([]);
  const [events, setEvents] = useState(mockEvents);
  const [transferTargetEmail, setTransferTargetEmail] = useState({}); 
  
  useEffect(() => {
    const initialTickets = [];
    events.forEach(event => {
      event.auditoriums.forEach(aud => {
        aud.seats.forEach(seat => {
          if (seat.isBooked) {
            const isFacultyOnly = seat.isFacultyOnly;
            initialTickets.push({
              id: Math.random().toString(36).substr(2, 9),
              eventId: event.id,
              eventName: event.name,
              venue: event.venue,
              date: event.date,
              time: event.time,
              seatId: seat.id,
              row: seat.row,
              column: seat.column,
              originalPrice: seat.price,
              finalPrice: seat.price,
              qrCode: Math.random().toString(36).substr(2, 12).toUpperCase(),
              alternateId: Math.floor(Math.random() * 1000000).toString().padStart(6, '0'),
              isFacultyOnly: isFacultyOnly,
              status: 'valid'
            });
          }
        });
      });
    });
    setAllTickets(initialTickets);
  }, [events]); 

  const handleReturn = useCallback((ticketId) => {
    const ticket = userTickets.find(t => t.id === ticketId);
    if (!ticket) return;

    if (window.confirm(`Return ticket for ${ticket.eventName}?\n\nSeat: Row ${ticket.row}, Seat ${ticket.column}\nRefund: $${ticket.finalPrice}\n\nRefund will be processed in 1-2 business days.`)) {
      setEvents(prevEvents => prevEvents.map(e => e.id === ticket.eventId ? {...e, bookedSeats: e.bookedSeats - 1, auditoriums: e.auditoriums.map(a => ({...a, seats: a.seats.map(s => s.id === ticket.seatId ? {...s, isBooked: false} : s)}))} : e));
      setUserTickets(prevUserTickets => prevUserTickets.filter(t => t.id !== ticketId));
      setAllTickets(prevTickets => prevTickets.map(t => t.id === ticketId ? {...t, status: 'invalid'} : t));

      console.log(`Ticket returned!\n\nRefund of $${ticket.finalPrice} will be processed within 1-2 business days.`);
    }
  }, [userTickets, setEvents, setUserTickets, setAllTickets]);

  const handleTransfer = useCallback((ticketId) => {
    const email = transferTargetEmail[ticketId];
    if (!email || !email.includes('@')) {
      console.error("Invalid email");
      return;
    }

    const ticket = userTickets.find(t => t.id === ticketId);
    if (!ticket) return;

    if (window.confirm(`CONFIRM TRANSFER:\n\nAre you sure you want to transfer this ticket for ${ticket.eventName} to ${email}? This action cannot be undone.`)) {
      
      setUserTickets(prevUserTickets => prevUserTickets.filter(t => t.id !== ticketId));
      
      setTransferTargetEmail(prev => {
        const newState = { ...prev };
        delete newState[ticketId];
        return newState;
      });

      console.log(`Ticket ${ticket.id} transferred to ${email}! Confirmation email sent.`);
    }
  }, [userTickets, transferTargetEmail, setUserTickets]);


  const Login = () => {
    const [userType, setUserType] = useState('buyer');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState(false); // NEW state for login error
    const [specialAccommodations, setSpecialAccommodations] = useState({
      hasAccommodations: false,
      handicapAccessible: false,
      facultyRestricted: false
    });

    const handleLogin = () => {
      setLoginError(false); // Clear previous errors

      if (!username || !password) {
        setLoginError(true);
        console.error('Please enter username and password');
        return;
      }
      
      const dummyAccount = dummyAccounts.find(
        acc => acc.username === username && acc.password === password
      );

      if (dummyAccount) {
        setCurrentUser(dummyAccount);
        if (dummyAccount.role === 'enforcer') setActiveTab('validate');
        else setActiveTab('events');
        return;
      }

      // Check if username exists but password is wrong (only for dummy accounts for simple demo)
      const existingUser = dummyAccounts.find(acc => acc.username === username);
      if (existingUser && existingUser.password !== password) {
          setLoginError(true);
          return;
      }


      // If not a dummy account, create a new user (simple sign-up/login for non-dummy users)
      const user = {
        id: Math.random().toString(36).substr(2, 9),
        name: username,
        username: username,
        password: password, 
        role: userType,
        email: `${username}@cofc.edu`, 
        discount: userType === 'buyer' ? 0.1 : 0,
        specialAccommodations: userType === 'buyer' ? specialAccommodations : null,
        createdAt: new Date().toISOString()
      };
      
      setCurrentUser(user);
      setActiveTab('events');
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-2xl shadow-xl p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-center mb-6 text-white">Box Office Dragon</h1>
          <div className="space-y-4">
            {/* NEW: Error Message */}
            {loginError && (
                <p className="text-red-500 font-semibold text-center bg-red-900/20 p-2 rounded border border-red-500">
                    User name or password incorrect.
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
                onChange={(e) => {setUsername(e.target.value); setLoginError(false);}} // Clear error on input
                placeholder="Username" 
                className="w-full p-3 border border-gray-700 rounded-lg bg-gray-700 text-white" 
            />
            <input 
                type="password" 
                value={password} 
                onChange={(e) => {setPassword(e.target.value); setLoginError(false);}} // Clear error on input
                placeholder="Password" 
                className="w-full p-3 border border-gray-700 rounded-lg bg-gray-700 text-white" 
            />
            <button onClick={handleLogin} className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700">Login</button>
          </div>
        </div>
      </div>
    );
  };

  const EventList = () => (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-white">Available Events</h2>
      <div className="grid gap-6 md:grid-cols-2">
        {events.map(event => (
          <div key={event.id} className="bg-gray-800 text-white rounded-xl shadow-lg p-6 cursor-pointer hover:bg-gray-700" onClick={() => setSelectedEvent(event)}>
            <h3 className="text-xl font-bold mb-3">{event.name}</h3>
            <div className="space-y-2 text-sm mb-4">
              <div className="flex items-center gap-2"><MapPin size={16} /><span>{event.venue}</span></div>
              <div className="flex items-center gap-2"><Calendar size={16} /><span>{event.date} at {event.time}</span></div>
              <div className="flex items-center gap-2"><Users size={16} /><span>{Math.round((event.bookedSeats / event.capacity) * 100)}% full</span></div>
            </div>
            <p className="text-gray-300 text-sm">{event.description}</p>
            <div className="mt-4 h-2 bg-gray-700 rounded">
              <div className="h-2 bg-blue-500 rounded" style={{ width: `${(event.bookedSeats / event.capacity) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const SeatSelection = () => {
    if (!selectedEvent) return <EventList />;

    const handleSeatSelect = (seat) => {
      if (seat.isBooked) return;
      setSelectedSeat(seat);
    };

    const getSeatColor = (seat) => {
      if (seat.isBooked) return 'bg-gray-600';
      if (seat.id === selectedSeat?.id) return 'bg-green-500';
      if (seat.tier === 'premium') return 'bg-yellow-400';
      if (seat.tier === 'standard') return 'bg-blue-400';
      return 'bg-green-400';
    };

    const bookSeat = () => { 
      const finalPrice = currentUser.role === 'buyer' ? selectedSeat.price * (1 - currentUser.discount) : selectedSeat.price;
      const ticket = {
        id: Math.random().toString(36).substr(2, 9),
        eventId: selectedEvent.id,
        eventName: selectedEvent.name,
        venue: selectedEvent.venue,
        date: selectedEvent.date,
        time: selectedEvent.time,
        seatId: selectedSeat.id,
        row: selectedSeat.row,
        column: selectedSeat.column,
        originalPrice: selectedSeat.price,
        finalPrice: finalPrice.toFixed(2),
        qrCode: Math.random().toString(36).substr(2, 12).toUpperCase(),
        alternateId: Math.floor(Math.random() * 1000000).toString().padStart(6, '0'),
        isFacultyOnly: selectedSeat.isFacultyOnly,
        status: 'valid'
      };
      
      setUserTickets([...userTickets, ticket]);
      setAllTickets(prevTickets => [...prevTickets, ticket]);
      
      setEvents(events.map(e => e.id === selectedEvent.id ? {...e, bookedSeats: e.bookedSeats + 1, auditoriums: e.auditoriums.map(a => ({...a, seats: a.seats.map(s => s.id === selectedSeat.id ? {...s, isBooked: true} : s)}))} : e));
      setSelectedSeat(null);
      console.log('Ticket booked!'); 
    };

    return (
      <div className="space-y-6">
        <button onClick={() => setSelectedEvent(null)} className="text-blue-400">← Back</button>
        <h2 className="text-2xl font-bold text-white">{selectedEvent.name}</h2>
        {selectedEvent.auditoriums.map(aud => (
          <div key={aud.id} className="bg-gray-900 text-white rounded-xl shadow-lg p-6">
            <div className="text-center mb-6 bg-gray-800 text-white py-3 rounded-lg">STAGE</div>
            <div className="grid gap-1 justify-center" style={{gridTemplateColumns: 'repeat(20, 1fr)'}}>
              {aud.seats.map(seat => (
                <button key={seat.id} onClick={() => handleSeatSelect(seat)} disabled={seat.isBooked} className={`w-7 h-7 text-xs rounded ${getSeatColor(seat)}`}>
                  {seat.column}
                </button>
              ))}
            </div>
            {selectedSeat && (
              <div className="mt-6 p-4 bg-gray-800 rounded-lg">
                <p>Row {selectedSeat.row}, Seat {selectedSeat.column}</p>
                <p>Price: ${selectedSeat.price}</p>
                {currentUser.role === 'buyer' && <p className="text-green-400">Discount: -${(selectedSeat.price * currentUser.discount).toFixed(2)}</p>}
                <p className="font-bold">Final: ${currentUser.role === 'buyer' ? (selectedSeat.price * (1 - currentUser.discount)).toFixed(2) : selectedSeat.price}</p>
                <button onClick={bookSeat} className="mt-3 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">Book Seat</button>
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
      <div className="bg-gray-900 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold">Box Office Dragon</h1>
          <div className="flex gap-4">
            {(currentUser.role === 'buyer' || currentUser.role === 'admin') && (
              <>
                <button onClick={() => setActiveTab('events')} className={`px-4 py-2 rounded ${activeTab === 'events' ? 'bg-gray-800' : ''}`}>Events</button>
                <button onClick={() => setActiveTab('tickets')} className={`px-4 py-2 rounded ${activeTab === 'tickets' ? 'bg-gray-800' : ''}`}>My Tickets</button>
              </>
            )}
            {currentUser.role === 'enforcer' && (
              <button onClick={() => setActiveTab('validate')} className={`px-4 py-2 rounded ${activeTab === 'validate' ? 'bg-gray-800' : ''}`}>Validate Tickets</button>
            )}
            <button onClick={() => setCurrentUser(null)} className="text-red-400">Logout</button>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'events' && <SeatSelection />}
        {activeTab === 'tickets' && 
            <MyTickets 
                userTickets={userTickets}
                transferTargetEmail={transferTargetEmail}
                setTransferTargetEmail={setTransferTargetEmail}
                setActiveTab={setActiveTab}
                handleReturn={handleReturn}
                handleTransfer={handleTransfer}
            />
        }
        {activeTab === 'validate' && currentUser.role === 'enforcer' && <TicketValidation allTickets={allTickets} setAllTickets={setAllTickets} />}
      </div>
    </div>
  );
}

export default App;
