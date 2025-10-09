const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Database Configuration
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'box_office_dragon',
  password: process.env.DB_PASSWORD || 'password', 
  port: process.env.DB_PORT || 5432,
});

// Test DB connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to PostgreSQL:', err);
    console.log('FATAL: Database connection failed. Ensure PostgreSQL server is running and configuration is correct.');
    process.exit(1);
  } else {
    console.log('Connected to PostgreSQL database successfully:', res.rows[0].now);
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Helper functions
const generateId = (prefix = '') => prefix + crypto.randomBytes(6).toString('hex');
const generateQRCode = () => crypto.randomBytes(6).toString('hex').toUpperCase();
const generateAlternateId = () => Math.floor(Math.random() * 1000000).toString().padStart(6, '0');

// ============ AUTH ROUTES ============

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Query the user by username
    const userQuery = 'SELECT id, username, password_hash, role, email, discount, has_accommodations, handicap_accessible, faculty_restricted, name FROM users WHERE username = $1';
    const result = await pool.query(userQuery, [username]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    // NOTE: In a production app, the password must be checked against the hash using bcrypt.
    // For this demonstration, we are only checking the username against the dummy records.
    
    const { password_hash, ...userWithoutHash } = user;
    
    res.json({
      user: {
        ...userWithoutHash,
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

// ============ ADMIN ROUTES ============

// Get all users for Admin lookup
app.get('/api/admin/users', async (req, res) => {
    // NOTE: This route should have authentication/authorization middleware to ensure only 'admin' can access it.
    try {
        const usersQuery = `
            SELECT id, name, username, role, email, discount, 
                   has_accommodations AS "hasAccommodations", 
                   handicap_accessible AS "handicapAccessible", 
                   faculty_restricted AS "facultyRestricted", 
                   created_at AS "createdAt"
            FROM users
            ORDER BY created_at DESC;
        `;
        const result = await pool.query(usersQuery);
        res.json({ users: result.rows });
    } catch (err) {
        console.error('Admin get users error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create new event
app.post('/api/admin/events', async (req, res) => {
    // NOTE: This route should have authorization middleware to ensure only 'admin' can access it.
    const { name, venue, date, time, capacity, description, category } = req.body;
    
    // Basic validation
    if (!name || !venue || !date || !time || !capacity) {
        return res.status(400).json({ error: 'Missing required event fields.' });
    }

    try {
        const insertQuery = `
            INSERT INTO events (name, venue, date, time, capacity, description, category, booked_seats)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
            RETURNING id, name;
        `;
        const result = await pool.query(insertQuery, [name, venue, date, time, capacity, description, category]);

        // Simplified event creation: Auto-create a default auditorium for the new event
        const newEventId = result.rows[0].id;
        const defaultAuditoriumName = `${venue} Main Area`;
        const audInsertQuery = `
            INSERT INTO auditoriums (event_id, name)
            VALUES ($1, $2)
        `;
        await pool.query(audInsertQuery, [newEventId, defaultAuditoriumName]);


        res.status(201).json({ 
            message: `Event "${result.rows[0].name}" created successfully with default auditorium.`,
            event: result.rows[0]
        });
    } catch (err) {
        console.error('Admin create event error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete event
app.delete('/api/admin/events/:id', async (req, res) => {
    // NOTE: This route should have authorization middleware to ensure only 'admin' can access it.
    const eventId = parseInt(req.params.id);

    try {
        const deleteQuery = 'DELETE FROM events WHERE id = $1 RETURNING name';
        const result = await pool.query(deleteQuery, [eventId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Event not found.' });
        }

        res.json({ message: `Event "${result.rows[0].name}" and all associated seats/tickets deleted successfully.` });
    } catch (err) {
        console.error('Admin delete event error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============ EVENT ROUTES ============

app.get('/api/events', async (req, res) => {
    try {
        const eventsQuery = 'SELECT id, name, venue, date, time, capacity, booked_seats, description, category FROM events ORDER BY date, time';
        const result = await pool.query(eventsQuery);
        res.json({ events: result.rows });
    } catch (err) {
        console.error('Get events error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/events/:id', async (req, res) => {
    try {
        const eventId = parseInt(req.params.id);
        
        const eventQuery = 'SELECT id, name, venue, date, time, capacity, booked_seats, description, category FROM events WHERE id = $1';
        const eventResult = await pool.query(eventQuery, [eventId]);
        if (eventResult.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }
        const event = eventResult.rows[0];

        const auditoriumsQuery = 'SELECT id, name FROM auditoriums WHERE event_id = $1';
        const audResult = await pool.query(auditoriumsQuery, [eventId]);
        
        const auditoriums = audResult.rows;

        // Fetch seats for all auditoriums in parallel
        await Promise.all(auditoriums.map(async (aud) => {
            const seatsQuery = `
                SELECT 
                    id, row_number AS row, column_number AS column, 
                    tier, price, is_handicap AS "isHandicap", 
                    is_faculty_only AS "isFacultyOnly", is_booked AS "isBooked"
                FROM seats WHERE auditorium_id = $1
                ORDER BY row_number, column_number
            `;
            const seatsResult = await pool.query(seatsQuery, [aud.id]);
            aud.seats = seatsResult.rows;
        }));

        res.json({ event: { ...event, auditoriums: auditoriums } });

    } catch (err) {
        console.error('Get event error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// ============ TICKET ROUTES (STUBS) ============

app.post('/api/tickets/book', async (req, res) => {
  // Logic to handle booking (omitted for brevity, assume full implementation exists)
  // IMPORTANT: Add a check here to block admins from booking tickets:
  // if (user.role === 'admin') { return res.status(403).json({ error: 'Admins cannot purchase tickets.' }); }

  res.status(501).json({ error: "Booking logic needs full PostgreSQL implementation." });
});

app.get('/api/tickets/user/:userId', async (req, res) => {
  // Logic to fetch user tickets (omitted for brevity, assume full implementation exists)
  res.status(501).json({ error: "Get user tickets logic needs full PostgreSQL implementation." });
});

app.post('/api/tickets/return', async (req, res) => {
  // Logic to handle return (omitted for brevity, assume full implementation exists)
  res.status(501).json({ error: "Return logic needs full PostgreSQL implementation." });
});

app.post('/api/tickets/transfer', async (req, res) => {
  // Logic to handle transfer (omitted for brevity, assume full implementation exists)
  res.status(501).json({ error: "Transfer logic needs full PostgreSQL implementation." });
});

app.post('/api/tickets/validate', async (req, res) => {
  // Logic to handle validation (omitted for brevity, assume full implementation exists)
  res.status(501).json({ error: "Validation logic needs full PostgreSQL implementation." });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    storage: 'PostgreSQL'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});