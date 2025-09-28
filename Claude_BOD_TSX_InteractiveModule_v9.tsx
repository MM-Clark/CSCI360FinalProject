import React, { useState } from 'react';
import { User, Calendar, MapPin, QrCode, Shield, Scan, Users, AlertCircle } from 'lucide-react';

// Mock data with CofC-specific events
const mockEvents = [
  {
    id: 1,
    name: 'Cougar Basketball vs Citadel',
    venue: 'TD Arena',
    date: '2024-11-25',
    time: '19:00',
    capacity: 5100,
    bookedSeats: 1122,
    description: 'CofC Cougars take on The Citadel Bulldogs in conference play. Come support our Cougars!',
    category: 'Sports',
    auditoriums: [
      {
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
      }
    ]
  },
  {
    id: 2,
    name: 'Theatre: The Tempest',
    venue: 'Emmett Robinson Theatre',
    date: '2024-12-05',
    time: '19:30',
    capacity: 240,
    bookedSeats: 156,
    description: 'Shakespeare\'s final play performed by CofC Theatre students. A magical tale of shipwreck and redemption.',
    category: 'Theatre',
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
    date: '2024-11-30',
    time: '20:00',
    capacity: 150,
    bookedSeats: 67,
    description: 'CofC Jazz Ensemble presents an evening of contemporary and classic jazz.',
    category: 'Music',
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
  }
];

const BoxOfficeDragon = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('events');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [userTickets, setUserTickets] = useState([]);
  const [events, setEvents] = useState(mockEvents);
  const [allUsers, setAllUsers] = useState([]); // Store all registered users

  // Login component
  const Login = () => {
    const [userType, setUserType] = useState('buyer');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [specialAccommodations, setSpecialAccommodations] = useState({
      hasAccommodations: false,
      handicapAccessible: false,
      facultyRestricted: false
    });

    const handleLogin = () => {
      if (!username || !password) {
        alert('Please enter both username and password');
        return;
      }

      const user = {
        id: Math.random().toString(36).substr(2, 9),
        name: username,
        username: username,
        password: password, // In real app, this would be hashed
        role: userType,
        email: `${username}@cofc.edu`,
        discount: userType === 'buyer' ? 0.1 : 0,
        specialAccommodations: userType === 'buyer' ? specialAccommodations : null,
        createdAt: new Date().toISOString()
      };
      
      // Add user to all users list
      setAllUsers(prev => [...prev.filter(u => u.username !== username), user]);
      setCurrentUser(user);
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-white font-bold text-xl">BOD</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Box Office Dragon</h1>
            <p className="text-gray-600">CofC Event Ticketing</p>
          </div>
          
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">User Type</label>
              <select 
                value={userType} 
                onChange={(e) => setUserType(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="buyer">Buyer (Student/Faculty/Staff)</option>
                <option value="admin">Admin</option>
                <option value="enforcer">Ticket Enforcer</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {userType === 'buyer' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Special Accommodations</label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={specialAccommodations.hasAccommodations}
                      onChange={(e) => {
                        setSpecialAccommodations({
                          ...specialAccommodations,
                          hasAccommodations: e.target.checked,
                          handicapAccessible: e.target.checked ? specialAccommodations.handicapAccessible : false,
                          facultyRestricted: e.target.checked ? specialAccommodations.facultyRestricted : false
                        });
                      }}
                      className="mr-2"
                    />
                    <span className="text-sm">I require special seating accommodations</span>
                  </label>
                  
                  {specialAccommodations.hasAccommodations && (
                    <div className="ml-6 space-y-2">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={specialAccommodations.handicapAccessible}
                          onChange={(e) => setSpecialAccommodations({
                            ...specialAccommodations,
                            handicapAccessible: e.target.checked
                          })}
                          className="mr-2"
                        />
                        <span className="text-sm">Handicap accessible seating required</span>
                      </label>
                      
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={specialAccommodations.facultyRestricted}
                          onChange={(e) => setSpecialAccommodations({
                            ...specialAccommodations,
                            facultyRestricted: e.target.checked
                          })}
                          className="mr-2"
                        />
                        <span className="text-sm">Faculty/Staff seating access</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <button
              onClick={handleLogin}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Login to Box Office Dragon
            </button>
          </div>

          <div className="mt-6 text-center text-sm text-gray-500">
            <p>CofC Community Members receive 10% discount</p>
          </div>
        </div>
      </div>
    );
  };

  // Event List Component
  const EventList = () => {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold text-gray-800">Available Events</h2>
          {currentUser.role === 'buyer' && (
            <div className="text-sm text-gray-600 bg-green-50 px-3 py-1 rounded-full border border-green-200">
              CofC Community - 10% Discount Applied
            </div>
          )}
        </div>
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {events.map(event => (
            <div 
              key={event.id} 
              className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all cursor-pointer border hover:border-blue-200"
              onClick={() => setSelectedEvent(event)}
            >
              <div className="mb-3">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  event.category === 'Sports' ? 'bg-red-100 text-red-800' :
                  event.category === 'Theatre' ? 'bg-purple-100 text-purple-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {event.category}
                </span>
              </div>

              <h3 className="text-xl font-bold text-gray-800 mb-3">{event.name}</h3>
              
              <div className="space-y-2 text-sm text-gray-600 mb-4">
                <div className="flex items-center gap-2">
                  <MapPin size={16} />
                  <span>{event.venue}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={16} />
                  <span>{event.date} at {event.time}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users size={16} />
                  <span>{Math.round((event.bookedSeats / event.capacity) * 100)}% full</span>
                </div>
              </div>
              
              <p className="text-gray-700 text-sm mb-4">{event.description}</p>
              
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all" 
                  style={{width: `${(event.bookedSeats / event.capacity) * 100}%`}}
                />
              </div>
              
              <div className="mt-2 text-xs text-gray-500">
                {event.capacity - event.bookedSeats} seats remaining
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Seat Selection Component
  const SeatSelection = () => {
    if (!selectedEvent) return <EventList />;

    const handleSeatSelect = (seat) => {
      if (seat.isBooked) return;
      
      // Check if user needs handicap accessible seating but seat isn't accessible
      if (currentUser.specialAccommodations?.handicapAccessible && !seat.isHandicap) {
        alert('You require handicap accessible seating. Please select a seat marked with a purple border.');
        return;
      }
      
      // Check if seat is faculty restricted
      if (seat.isFacultyOnly && currentUser.role !== 'buyer' && currentUser.role !== 'admin') {
        alert('This seat is reserved for CofC community members only.');
        return;
      }
      
      // Check if seat is faculty restricted but user doesn't have faculty access
      if (seat.isFacultyOnly && currentUser.role === 'buyer' && !currentUser.specialAccommodations?.facultyRestricted) {
        alert('This seat is reserved for faculty/staff. Please select a different seat.');
        return;
      }
      
      setSelectedSeat(seat);
    };

    const getSeatColor = (seat) => {
      if (seat.isBooked) return 'bg-gray-400 cursor-not-allowed';
      if (seat.id === selectedSeat?.id) return 'bg-green-500';
      if (seat.tier === 'premium') return 'bg-yellow-400 hover:bg-yellow-500';
      if (seat.tier === 'standard') return 'bg-blue-400 hover:bg-blue-500';
      if (seat.tier === 'economy') return 'bg-green-400 hover:bg-green-500';
      return 'bg-gray-300';
    };

    const getSeatBorder = (seat) => {
      if (seat.isHandicap) return 'border-2 border-purple-600';
      if (seat.isFacultyOnly) return 'border-2 border-red-600';
      return 'border border-gray-300';
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-white rounded-lg p-4 shadow-md">
          <button 
            onClick={() => setSelectedEvent(null)}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back to Events
          </button>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-800">{selectedEvent.name}</h2>
            <p className="text-gray-600">{selectedEvent.venue}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Capacity</p>
            <p className="font-bold">{selectedEvent.capacity}</p>
          </div>
        </div>

        {selectedEvent.auditoriums.map(auditorium => (
          <div key={auditorium.id} className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-xl font-semibold mb-6 text-center">{auditorium.name}</h3>
            
            {/* Legend */}
            <div className="mb-8 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-400 border border-gray-300 rounded"></div>
                  <span>Premium ($30-85)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-400 border border-gray-300 rounded"></div>
                  <span>Standard ($20-45)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-400 border border-gray-300 rounded"></div>
                  <span>Economy ($12-25)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-400 border border-gray-300 rounded"></div>
                  <span>Booked</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-white border-2 border-purple-600 rounded"></div>
                  <span>Handicap</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-white border-2 border-red-600 rounded"></div>
                  <span>CofC Only</span>
                </div>
              </div>
              {currentUser.role === 'buyer' && (
                <div className="mt-3 text-center text-green-600 font-medium">
                  CofC Discount: 10% off all tickets
                </div>
              )}
            </div>

            {/* Stage/Performance Area */}
            <div className="text-center mb-6">
              <div className="bg-gray-800 text-white py-3 px-8 rounded-lg inline-block">
                {selectedEvent.category === 'Sports' ? 'COURT' : 
                 selectedEvent.category === 'Theatre' ? 'STAGE' : 'PERFORMANCE AREA'}
              </div>
            </div>

            {/* Seats Grid */}
            <div className="mb-6 overflow-auto">
              <div 
                className="grid gap-1 justify-center min-w-max mx-auto" 
                style={{
                  gridTemplateColumns: selectedEvent.capacity === 5100 ? 'repeat(20, 1fr)' :
                                     selectedEvent.capacity === 240 ? 'repeat(15, 1fr)' : 
                                     'repeat(12, 1fr)'
                }}
              >
                {auditorium.seats.map(seat => (
                  <button
                    key={seat.id}
                    onClick={() => handleSeatSelect(seat)}
                    disabled={seat.isBooked}
                    className={`w-7 h-7 text-xs font-bold rounded transition-all ${getSeatColor(seat)} ${getSeatBorder(seat)}`}
                    title={`Row ${seat.row}, Seat ${seat.column} - $${seat.price}`}
                  >
                    {seat.column}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Seat Details */}
            {selectedSeat && (
              <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
                <h4 className="font-bold text-lg mb-4">Selected Seat Details</h4>
                
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between">
                    <span>Location:</span>
                    <span>Row {selectedSeat.row}, Seat {selectedSeat.column}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tier:</span>
                    <span className="capitalize">{selectedSeat.tier}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Original Price:</span>
                    <span>${selectedSeat.price}</span>
                  </div>
                  {currentUser.role === 'buyer' && (
                    <div className="flex justify-between text-green-600">
                      <span>CofC Discount (10%):</span>
                      <span>-${(selectedSeat.price * 0.1).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Final Price:</span>
                    <span>
                      ${currentUser.role === 'buyer' ? 
                        (selectedSeat.price * 0.9).toFixed(2) : 
                        selectedSeat.price}
                    </span>
                  </div>
                </div>
                
                <button
                  onClick={() => bookSeat()}
                  className="w-full bg-green-600 text-white py-3 px-6 rounded-lg hover:bg-green-700 transition-colors font-bold"
                >
                  Book Seat - ${currentUser.role === 'buyer' ? 
                    (selectedSeat.price * 0.9).toFixed(2) : 
                    selectedSeat.price}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Book seat function
  const bookSeat = () => {
    if (!selectedSeat || !selectedEvent) return;

    const originalPrice = selectedSeat.price;
    const finalPrice = currentUser.role === 'buyer' ? originalPrice * 0.9 : originalPrice;

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
      originalPrice: originalPrice,
      finalPrice: finalPrice.toFixed(2),
      discount: currentUser.role === 'buyer' ? 0.1 : 0,
      tier: selectedSeat.tier,
      category: selectedEvent.category,
      qrCode: Math.random().toString(36).substr(2, 12).toUpperCase(),
      alternateId: Math.floor(Math.random() * 1000000),
      userId: currentUser.id,
      bookedAt: new Date().toISOString()
    };

    setUserTickets([...userTickets, ticket]);
    
    // Update seat as booked
    setEvents(prevEvents => 
      prevEvents.map(event => 
        event.id === selectedEvent.id 
          ? {
              ...event,
              bookedSeats: event.bookedSeats + 1,
              auditoriums: event.auditoriums.map(aud => ({
                ...aud,
                seats: aud.seats.map(seat => 
                  seat.id === selectedSeat.id ? {...seat, isBooked: true} : seat
                )
              }))
            }
          : event
      )
    );

    setSelectedSeat(null);
    alert('Ticket booked successfully! Confirmation email will be sent to your CofC email address.');
  };

  // My Tickets Component
  const MyTickets = () => {
    const returnTicket = (ticketId) => {
      const ticket = userTickets.find(t => t.id === ticketId);
      if (!ticket) return;

      if (window.confirm(`Are you sure you want to return your ticket for ${ticket.eventName}? You will receive a refund within 1-2 business days.`)) {
        setEvents(prevEvents => 
          prevEvents.map(event => 
            event.id === ticket.eventId 
              ? {
                  ...event,
                  bookedSeats: event.bookedSeats - 1,
                  auditoriums: event.auditoriums.map(aud => ({
                    ...aud,
                    seats: aud.seats.map(seat => 
                      seat.id === ticket.seatId ? {...seat, isBooked: false} : seat
                    )
                  }))
                }
              : event
          )
        );

        setUserTickets(userTickets.filter(t => t.id !== ticketId));
        alert('Ticket returned successfully! Refund will be processed within 1-2 business days.');
      }
    };

    const transferTicket = (ticketId) => {
      const email = prompt('Enter the recipient\'s email address for ticket transfer:');
      if (email && email.includes('@')) {
        alert(`Transfer invitation sent to ${email}! They will receive an email to accept the ticket.`);
      } else if (email) {
        alert('Please enter a valid email address.');
      }
    };

    return (
      <div className="space-y-6">
        <h2 className="text-3xl font-bold text-gray-800">My Tickets</h2>
        
        {userTickets.length === 0 ? (
          <div className="text-center py-16">
            <QrCode size={80} className="mx-auto mb-4 text-gray-400" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">No tickets yet</h3>
            <p className="text-gray-500 mb-6">Browse events to book your first ticket</p>
            <button
              onClick={() => setActiveTab('events')}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
            >
              Browse Events
            </button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {userTickets.map(ticket => (
              <div key={ticket.id} className="bg-white rounded-xl shadow-lg border overflow-hidden">
                {/* Ticket Header */}
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4">
                  <h3 className="text-lg font-bold">{ticket.eventName}</h3>
                  <p className="text-blue-100">{ticket.category}</p>
                </div>

                {/* Ticket Details */}
                <div className="p-6">
                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Venue:</span>
                      <span className="font-semibold">{ticket.venue}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Date & Time:</span>
                      <span className="font-semibold">{ticket.date} at {ticket.time}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Seat:</span>
                      <span className="font-semibold">Row {ticket.row}, Seat {ticket.column}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tier:</span>
                      <span className="font-semibold capitalize">{ticket.tier}</span>
                    </div>
                    
                    {ticket.discount > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>CofC Discount (10%):</span>
                        <span>-${(ticket.originalPrice * ticket.discount).toFixed(2)}</span>
                      </div>
                    )}
                    
                    <div className="flex justify-between text-lg font-bold border-t pt-2">
                      <span>Final Price:</span>
                      <span>${ticket.finalPrice}</span>
                    </div>
                  </div>
                
                  {/* QR Code Section */}
                  <div className="bg-gray-50 p-6 rounded-lg mb-6 text-center">
                    <div className="bg-white p-4 inline-block rounded-lg border-2 border-dashed border-gray-300">
                      <QrCode size={100} className="mx-auto mb-3 text-gray-700" />
                      <p className="text-xs font-mono font-bold">{ticket.qrCode}</p>
                    </div>
                    <p className="text-sm text-gray-600 mt-3">
                      Alternate ID: <span className="font-bold">{ticket.alternateId}</span>
                    </p>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => transferTicket(ticket.id)}
                      className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 text-sm"
                    >
                      Transfer
                    </button>
                    <button
                      onClick={() => returnTicket(ticket.id)}
                      className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 text-sm"
                    >
                      Return
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Ticket Verification Component
  const TicketVerification = () => {
    const [scanInput, setScanInput] = useState('');
    const [verificationResult, setVerificationResult] = useState(null);
    const [selectedEventForCheck, setSelectedEventForCheck] = useState(null);

    const verifyTicket = () => {
      const ticket = userTickets.find(t => 
        t.qrCode === scanInput.toUpperCase() || 
        t.alternateId.toString() === scanInput
      );

      if (ticket) {
        setVerificationResult({
          valid: true,
          ticket: ticket,
          message: 'Valid ticket'
        });
      } else {
        setVerificationResult({
          valid: false,
          message: 'Invalid ticket or ticket not found'
        });
      }
    };

    return (
      <div className="space-y-6">
        <h2 className="text-3xl font-bold text-gray-800">Ticket Verification</h2>
        
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-semibold mb-4">Scan Ticket</h3>
          <div className="space-y-4">
            <input
              type="text"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              placeholder="Enter QR code or Alternate ID"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={verifyTicket}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Scan size={16} />
              Verify Ticket
            </button>
          </div>

          {verificationResult && (
            <div className={`mt-4 p-4 rounded-lg ${verificationResult.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className={`flex items-center gap-2 ${verificationResult.valid ? 'text-green-800' : 'text-red-800'}`}>
                {verificationResult.valid ? (
                  <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                ) : (
                  <AlertCircle size={16} />
                )}
                <span className="font-semibold">{verificationResult.message}</span>
              </div>
              
              {verificationResult.valid && verificationResult.ticket && (
                <div className="mt-3 text-gray-700">
                  <p><strong>Event:</strong> {verificationResult.ticket.eventName}</p>
                  <p><strong>Seat:</strong> Row {verificationResult.ticket.row}, Seat {verificationResult.ticket.column}</p>
                  <p><strong>Date:</strong> {verificationResult.ticket.date}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-semibold mb-4">Event Capacity Check</h3>
          <select
            value={selectedEventForCheck?.id || ''}
            onChange={(e) => setSelectedEventForCheck(events.find(ev => ev.id === parseInt(e.target.value)))}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mb-4"
          >
            <option value="">Select an event</option>
            {events.map(event => (
              <option key={event.id} value={event.id}>{event.name}</option>
            ))}
          </select>

          {selectedEventForCheck && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-semibold mb-2">{selectedEventForCheck.name}</h4>
              <div className="space-y-2">
                <p><strong>Venue:</strong> {selectedEventForCheck.venue}</p>
                <p><strong>Date:</strong> {selectedEventForCheck.date} at {selectedEventForCheck.time}</p>
                <p><strong>Capacity:</strong> {selectedEventForCheck.capacity}</p>
                <p><strong>Booked:</strong> {selectedEventForCheck.bookedSeats}</p>
                <p><strong>Available:</strong> {selectedEventForCheck.capacity - selectedEventForCheck.bookedSeats}</p>
                <p><strong>Occupancy:</strong> {Math.round((selectedEventForCheck.bookedSeats / selectedEventForCheck.capacity) * 100)}%</p>
              </div>
              <div className="mt-3">
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-blue-600 h-3 rounded-full" 
                    style={{width: `${(selectedEventForCheck.bookedSeats / selectedEventForCheck.capacity) * 100}%`}}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Main Navigation
  const Navigation = () => {
    const tabs = [
      { id: 'events', label: 'Events', icon: Calendar },
      { id: 'tickets', label: 'My Tickets', icon: QrCode },
    ];

    if (currentUser?.role === 'enforcer') {
      tabs.push({ id: 'verify', label: 'Verify Tickets', icon: Shield });
    }

    return (
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-gray-800">Box Office Dragon</h1>
              <div className="flex space-x-1">
                {tabs.map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        if (tab.id === 'events') {
                          setSelectedEvent(null);
                          setSelectedSeat(null);
                        }
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                        activeTab === tab.id 
                          ? 'bg-blue-100 text-blue-700' 
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      <Icon size={16} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User size={16} />
                <span>{currentUser.name} ({currentUser.role === 'buyer' ? 'CofC Community' : currentUser.role})</span>
              </div>
              <button
                onClick={() => setCurrentUser(null)}
                className="text-red-600 hover:text-red-800 text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Main App
  if (!currentUser) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'events' && <SeatSelection />}
        {activeTab === 'tickets' && <MyTickets />}
        {activeTab === 'verify' && currentUser.role === 'enforcer' && <TicketVerification />}
      </div>
    </div>
  );
};

export default BoxOfficeDragon;