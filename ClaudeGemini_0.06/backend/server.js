const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// In-Memory Data Storage
let users = [
  {
    id: 'admin001',
    name: 'Sarah Chen',
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    email: 'admin@cofc.edu',
    discount: 0,
    has_accommodations: false,
    handicap_accessible: false,
    faculty_restricted: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'enforcer001',
    name: 'Marcus Williams',
    username: 'enforcer',
    password: 'enforcer123',
    role: 'enforcer',
    email: 'enforcer@cofc.edu',
    discount: 0,
    has_accommodations: false,
    handicap_accessible: false,
    faculty_restricted: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'student001',
    name: 'Emily Rodriguez',
    username: 'student',
    password: 'student123',
    role: 'buyer',
    email: 'student@cofc.edu',
    discount: 0.10,
    has_accommodations: false,
    handicap_accessible: false,
    faculty_restricted: false,
    created_at: new Date().toISOString()
  }
];

let events = [
  {
    id: 1,
    name: 'Cougar Basketball vs Citadel',
    venue: 'TD Arena',
    date: '2025-11-25',
    time: '19:00:00',
    capacity: 5100,
    booked_seats: 0,
    description: 'CofC Cougars take on The Citadel Bulldogs.',
    category: 'Sports',
    created_at: new Date().toISOString()
  },
  {
    id: 2,
    name: 'Theatre: The Tempest',
    venue: 'Emmett Robinson Theatre',
    date: '2025-12-05',
    time: '19:30:00',
    capacity: 240,
    booked_seats: 0,
    description: 'Shakespeare\'s final play performed by CofC Theatre students',
    category: 'Theatre',
    created_at: new Date().toISOString()
  },
  {
    id: 3,
    name: 'Jazz Ensemble Concert',
    venue: 'Recital Hall',
    date: '2025-11-29',
    time: '20:00:00',
    capacity: 150,
    booked_seats: 0,
    description: 'CofC Jazz Ensemble presents an evening of contemporary and classic jazz',
    category: 'Music',
    created_at: new Date().toISOString()
  },
  {
    id: 4,
    name: 'Violin Ensemble Concert',
    venue: 'Recital Hall',
    date: '2025-11-30',
    time: '20:00:00',
    capacity: 150,
    booked_seats: 0,
    description: 'CofC Violin Ensemble presents an evening of contemporary and classic violin',
    category: 'Music',
    created_at: new Date().toISOString()
  },
  {
    id: 5,
    name: 'Cougar Volleyball vs Charleston Southern',
    venue: 'TD Arena',
    date: '2026-01-26',
    time: '19:00:00',
    capacity: 5100,
    booked_seats: 0,
    description: 'CofC Cougars take on Charleston Southern.',
    category: 'Sports',
    created_at: new Date().toISOString()
  },
  {
    id: 6,
    name: 'Cougar Basketball vs Charleston Southern',
    venue: 'TD Arena',
    date: '2026-01-28',
    time: '19:00:00',
    capacity: 5100,
    booked_seats: 0,
    description: 'CofC Cougars take on Charleston Southern.',
    category: 'Sports',
    created_at: new Date().toISOString()
  }
];

let auditoriums = [];
let seats = [];
let tickets = [];
let ticketHistory = [];

// Initialize seats for first event
const initializeSeats = () => {
  // Basketball event
  auditoriums.push({
    id: 1,
    event_id: 1,
    name: 'Main Court'
  });

  for (let i = 0; i < 400; i++) {
    const row = Math.floor(i / 20) + 1;
    const col = (i % 20) + 1;
    const tier = i < 80 ? 'premium' : i < 240 ? 'standard' : 'economy';
    const price = i < 80 ? 85 : i < 240 ? 45 : 25;
    
    seats.push({
      id: i + 1,
      auditorium_id: 1,
      seat_number: i + 1,
      row_number: row,
      column_number: col,
      tier: tier,
      price: price,
      is_handicap: i % 25 === 0,
      is_faculty_only: (i % 30 === 0 && i < 60),
      is_booked: false
    });
  }

  // Theatre event
  auditoriums.push({
    id: 2,
    event_id: 2,
    name: 'Main Theatre'
  });

  for (let i = 0; i < 240; i++) {
    const row = Math.floor(i / 15) + 1;
    const col = (i % 15) + 1;
    const tier = i < 45 ? 'premium' : i < 150 ? 'standard' : 'economy';
    const price = i < 45 ? 35 : i < 150 ? 25 : 15;
    
    seats.push({
      id: 400 + i + 1,
      auditorium_id: 2,
      seat_number: i + 1,
      row_number: row,
      column_number: col,
      tier: tier,
      price: price,
      is_handicap: i % 20 === 0,
      is_faculty_only: (i % 25 === 0 && i < 45),
      is_booked: false
    });
  }

  // Concert Hall for Jazz (event 3)
  auditoriums.push({
    id: 3,
    event_id: 3,
    name: 'Concert Hall'
  });

  for (let i = 0; i < 150; i++) {
    const row = Math.floor(i / 12) + 1;
    const col = (i % 12) + 1;
    const tier = i < 36 ? 'premium' : i < 96 ? 'standard' : 'economy';
    const price = i < 36 ? 30 : i < 96 ? 20 : 12;
    
    seats.push({
      id: 640 + i + 1,
      auditorium_id: 3,
      seat_number: i + 1,
      row_number: row,
      column_number: col,
      tier: tier,
      price: price,
      is_handicap: i % 15 === 0,
      is_faculty_only: (i % 20 === 0 && i < 40),
      is_booked: false
    });
  }
};

initializeSeats();

// Helper functions
const generateId = (prefix = '') => prefix + crypto.randomBytes(6).toString('hex');
const generateQRCode = () => crypto.randomBytes(6).toString('hex').toUpperCase();
const generateAlternateId = () => Math.floor(Math.random() * 1000000).toString().padStart(6, '0');

// ============ AUTH ROUTES ============

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = users.find(u => u.username === username);

    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { password: _, ...userWithoutPassword } = user;
    
    res.json({
      user: {
        ...userWithoutPassword,
        specialAccommodations: {
          hasAccommodations: user.has_accommodations,
          handicapAccessible: user.handicap_accessible,
          facultyRestricted: user.faculty_restricted
        }
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/register', (req, res) => {
  try {
    const { name, username, password, email, role = 'buyer', specialAccommodations } = req.body;

    if (!name || !username || !password || !email) {
      return res.status(400).json({ error: 'All fields required' });
    }

    if (users.find(u => u.username === username || u.email === email)) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const userId = generateId('usr_');
    const discount = role === 'buyer' ? 0.10 : 0.00;

    const newUser = {
      id: userId,
      name,
      username,
      password,
      role,
      email,
      discount,
      has_accommodations: specialAccommodations?.hasAccommodations || false,
      handicap_accessible: specialAccommodations?.handicapAccessible || false,
      faculty_restricted: specialAccommodations?.facultyRestricted || false,
      created_at: new Date().toISOString()
    };

    users.push(newUser);

    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({ user: userWithoutPassword });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ EVENT ROUTES ============

app.get('/api/events', (req, res) => {
  try {
    const eventsWithCount = events.map(e => ({
      ...e,
      auditorium_count: auditoriums.filter(a => a.event_id === e.id).length
    }));
    res.json({ events: eventsWithCount });
  } catch (err) {
    console.error('Get events error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/events/:id', (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const event = events.find(e => e.id === eventId);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const eventAuditoriums = auditoriums.filter(a => a.event_id === eventId);
    
    eventAuditoriums.forEach(aud => {
      const audSeats = seats.filter(s => s.auditorium_id === aud.id);
      aud.seats = audSeats.map(s => ({
        id: s.id,
        row: s.row_number,
        column: s.column_number,
        tier: s.tier,
        price: s.price,
        isHandicap: s.is_handicap,
        isFacultyOnly: s.is_faculty_only,
        isBooked: s.is_booked
      }));
    });

    res.json({ event: { ...event, auditoriums: eventAuditoriums } });
  } catch (err) {
    console.error('Get event error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ TICKET ROUTES ============

app.post('/api/tickets/book', (req, res) => {
  try {
    const { userId, eventId, seatId } = req.body;

    if (!userId || !eventId || !seatId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const seat = seats.find(s => s.id === seatId);
    
    if (!seat || seat.is_booked) {
      return res.status(409).json({ error: 'Seat not available' });
    }

    const event = events.find(e => e.id === eventId);
    const user = users.find(u => u.id === userId);

    if (!event || !user) {
      return res.status(404).json({ error: 'Event or user not found' });
    }

    const originalPrice = seat.price;
    const finalPrice = originalPrice * (1 - user.discount);

    const ticketId = generateId('tkt_');
    const qrCode = generateQRCode();
    const alternateId = generateAlternateId();

    const ticket = {
      id: ticketId,
      user_id: userId,
      event_id: eventId,
      seat_id: seatId,
      original_price: originalPrice,
      final_price: finalPrice,
      qr_code: qrCode,
      alternate_id: alternateId,
      status: 'valid',
      created_at: new Date().toISOString()
    };

    tickets.push(ticket);
    seat.is_booked = true;
    event.booked_seats++;

    ticketHistory.push({
      ticket_id: ticketId,
      action: 'created',
      performed_by: userId,
      created_at: new Date().toISOString()
    });

    res.status(201).json({
      ticket: {
        id: ticket.id,
        eventId: event.id,
        eventName: event.name,
        venue: event.venue,
        date: event.date,
        time: event.time,
        seatId: seat.id,
        row: seat.row_number,
        column: seat.column_number,
        originalPrice: originalPrice,
        finalPrice: parseFloat(finalPrice.toFixed(2)),
        qrCode: qrCode,
        alternateId: alternateId,
        isFacultyOnly: seat.is_faculty_only,
        status: 'valid'
      }
    });
  } catch (err) {
    console.error('Book ticket error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/tickets/user/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    const userTickets = tickets.filter(t => t.user_id === userId && t.status !== 'invalid');

    const formattedTickets = userTickets.map(t => {
      const event = events.find(e => e.id === t.event_id);
      const seat = seats.find(s => s.id === t.seat_id);

      return {
        id: t.id,
        eventId: t.event_id,
        eventName: event.name,
        venue: event.venue,
        date: event.date,
        time: event.time,
        seatId: t.seat_id,
        row: seat.row_number,
        column: seat.column_number,
        originalPrice: t.original_price,
        finalPrice: parseFloat(t.final_price.toFixed(2)),
        qrCode: t.qr_code,
        alternateId: t.alternate_id,
        isFacultyOnly: seat.is_faculty_only,
        status: t.status
      };
    });

    res.json({ tickets: formattedTickets });
  } catch (err) {
    console.error('Get user tickets error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/tickets/return', (req, res) => {
  try {
    const { ticketId, userId } = req.body;

    if (!ticketId || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const ticket = tickets.find(t => t.id === ticketId && t.user_id === userId);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (ticket.status !== 'valid') {
      return res.status(400).json({ error: 'Ticket cannot be returned' });
    }

    ticket.status = 'invalid';
    
    const seat = seats.find(s => s.id === ticket.seat_id);
    seat.is_booked = false;

    const event = events.find(e => e.id === ticket.event_id);
    event.booked_seats--;

    ticketHistory.push({
      ticket_id: ticketId,
      action: 'returned',
      performed_by: userId,
      created_at: new Date().toISOString()
    });

    res.json({ 
      message: 'Ticket returned successfully',
      refund: parseFloat(ticket.final_price.toFixed(2))
    });
  } catch (err) {
    console.error('Return ticket error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/tickets/transfer', (req, res) => {
  try {
    const { ticketId, userId, targetEmail } = req.body;

    if (!ticketId || !userId || !targetEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const ticket = tickets.find(t => t.id === ticketId && t.user_id === userId);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (ticket.status !== 'valid') {
      return res.status(400).json({ error: 'Ticket cannot be transferred' });
    }

    ticket.status = 'transferred';
    ticket.transferred_to_email = targetEmail;
    ticket.transferred_at = new Date().toISOString();

    ticketHistory.push({
      ticket_id: ticketId,
      action: 'transferred',
      performed_by: userId,
      details: `Transferred to ${targetEmail}`,
      created_at: new Date().toISOString()
    });

    res.json({ 
      message: 'Ticket transferred successfully',
      targetEmail
    });
  } catch (err) {
    console.error('Transfer ticket error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/tickets/validate', (req, res) => {
  try {
    const { scanId, enforcerId } = req.body;

    if (!scanId || !enforcerId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const ticket = tickets.find(t => 
      t.qr_code === scanId.toUpperCase() || t.alternate_id === scanId
    );

    if (!ticket) {
      return res.json({
        valid: false,
        status: 'invalid',
        message: 'Ticket ID not found.'
      });
    }

    const event = events.find(e => e.id === ticket.event_id);
    const seat = seats.find(s => s.id === ticket.seat_id);

    if (ticket.status === 'used') {
      return res.json({
        valid: false,
        status: 'used',
        message: 'Ticket already scanned and used for entry.',
        ticket: {
          eventName: event.name,
          row: seat.row_number,
          column: seat.column_number,
          isFacultyOnly: seat.is_faculty_only
        }
      });
    }

    if (ticket.status === 'invalid' || ticket.status === 'transferred') {
      return res.json({
        valid: false,
        status: 'invalid',
        message: 'Ticket has been returned/cancelled and is no longer valid.',
        ticket: {
          eventName: event.name,
          row: seat.row_number,
          column: seat.column_number,
          isFacultyOnly: seat.is_faculty_only
        }
      });
    }

    ticket.status = 'used';

    ticketHistory.push({
      ticket_id: ticket.id,
      action: 'used',
      performed_by: enforcerId,
      created_at: new Date().toISOString()
    });

    res.json({
      valid: true,
      status: 'valid',
      message: 'SUCCESS! Ticket is VALID. Entry granted.',
      ticket: {
        eventName: event.name,
        venue: event.venue,
        date: event.date,
        time: event.time,
        row: seat.row_number,
        column: seat.column_number,
        isFacultyOnly: seat.is_faculty_only
      }
    });
  } catch (err) {
    console.error('Validate ticket error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    storage: 'in-memory'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Using in-memory storage (no database required)');
  console.log(`Events loaded: ${events.length}`);
  console.log(`Seats initialized: ${seats.length}`);
  console.log(`Users available: ${users.length}`);
});
