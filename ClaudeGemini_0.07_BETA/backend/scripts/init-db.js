const { Client } = require('pg');
require('dotenv').config({ path: '../../.env' });

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password', 
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'box_office_dragon' 
};

async function initializeDatabase() {
  const client = new Client(DB_CONFIG);
  
  try {
    await client.connect();
    console.log(`Connected to PostgreSQL database: ${DB_CONFIG.database}`);

    console.log('Creating tables...');

    // Drop tables in dependency order
    await client.query('DROP TABLE IF EXISTS ticket_history CASCADE;');
    await client.query('DROP TABLE IF EXISTS tickets CASCADE;');
    await client.query('DROP TABLE IF EXISTS seats CASCADE;');
    await client.query('DROP TABLE IF EXISTS auditoriums CASCADE;');
    await client.query('DROP TABLE IF EXISTS events CASCADE;');
    await client.query('DROP TABLE IF EXISTS users CASCADE;');
    console.log('✓ Existing tables dropped');

    // Users table (PostgreSQL uses VARCHAR with CHECK constraint instead of MySQL ENUM)
    await client.query(`
      CREATE TABLE users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(10) NOT NULL CHECK (role IN ('buyer', 'admin', 'enforcer')),
        email VARCHAR(100) UNIQUE NOT NULL,
        discount DECIMAL(3,2) DEFAULT 0.00,
        has_accommodations BOOLEAN DEFAULT FALSE,
        handicap_accessible BOOLEAN DEFAULT FALSE,
        faculty_restricted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Users table created');

    // Events table (PostgreSQL uses SERIAL for auto-increment)
    await client.query(`
      CREATE TABLE events (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        venue VARCHAR(100) NOT NULL,
        date DATE NOT NULL,
        time TIME NOT NULL,
        capacity INT NOT NULL,
        booked_seats INT DEFAULT 0,
        description TEXT,
        category VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Events table created');

    // Auditoriums table
    await client.query(`
      CREATE TABLE auditoriums (
        id SERIAL PRIMARY KEY,
        event_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ Auditoriums table created');

    // Seats table
    await client.query(`
      CREATE TABLE seats (
        id SERIAL PRIMARY KEY,
        auditorium_id INT NOT NULL,
        seat_number INT NOT NULL,
        row_number INT NOT NULL,
        column_number INT NOT NULL,
        tier VARCHAR(10) NOT NULL CHECK (tier IN ('premium', 'standard', 'economy')),
        price DECIMAL(10,2) NOT NULL,
        is_handicap BOOLEAN DEFAULT FALSE,
        is_faculty_only BOOLEAN DEFAULT FALSE,
        is_booked BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (auditorium_id) REFERENCES auditoriums(id) ON DELETE CASCADE,
        UNIQUE (auditorium_id, seat_number)
      )
    `);
    console.log('✓ Seats table created');

    // Tickets table
    await client.query(`
      CREATE TABLE tickets (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        event_id INT NOT NULL,
        seat_id INT NOT NULL,
        original_price DECIMAL(10,2) NOT NULL,
        final_price DECIMAL(10,2) NOT NULL,
        qr_code VARCHAR(20) UNIQUE NOT NULL,
        alternate_id VARCHAR(10) UNIQUE NOT NULL,
        status VARCHAR(20) DEFAULT 'valid' CHECK (status IN ('valid', 'used', 'invalid', 'transferred')),
        transferred_to_email VARCHAR(100),
        transferred_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (seat_id) REFERENCES seats(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ Tickets table created');

    // Ticket History table
    await client.query(`
      CREATE TABLE ticket_history (
        id SERIAL PRIMARY KEY,
        ticket_id VARCHAR(50) NOT NULL,
        action VARCHAR(20) NOT NULL CHECK (action IN ('created', 'transferred', 'returned', 'validated', 'used')),
        performed_by VARCHAR(50),
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ Ticket history table created');

    // Insert dummy users
    console.log('\nInserting sample data...');
    
    const userInsertQuery = `
      INSERT INTO users (id, name, username, password_hash, role, email, discount)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING;
    `;
    
    await client.query(userInsertQuery, ['admin001', 'Sarah Chen', 'admin', '$2b$10$dummyhash1', 'admin', 'admin@cofc.edu', 0.00]);
    await client.query(userInsertQuery, ['enforcer001', 'Marcus Williams', 'enforcer', '$2b$10$dummyhash2', 'enforcer', 'enforcer@cofc.edu', 0.00]);
    await client.query(userInsertQuery, ['student001', 'Emily Rodriguez', 'student', '$2b$10$dummyhash3', 'buyer', 'student@cofc.edu', 0.10]);
    console.log('✓ Sample users inserted');

    // Insert sample events
    const eventInsertQuery = `
      INSERT INTO events (id, name, venue, date, time, capacity, booked_seats, description, category)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO NOTHING;
    `;
    
    await client.query(eventInsertQuery, [1, 'Cougar Basketball vs Citadel', 'TD Arena', '2025-11-25', '19:00:00', 5100, 0, 'CofC Cougars take on The Citadel Bulldogs.', 'Sports']);
    await client.query(eventInsertQuery, [2, 'Theatre: The Tempest', 'Emmett Robinson Theatre', '2025-12-05', '19:30:00', 240, 0, 'Shakespeare\'s final play performed by CofC Theatre students', 'Theatre']);
    await client.query(eventInsertQuery, [3, 'Jazz Ensemble Concert', 'Recital Hall', '2025-11-29', '20:00:00', 150, 0, 'CofC Jazz Ensemble presents an evening of contemporary and classic jazz', 'Music']);
    await client.query(eventInsertQuery, [4, 'Violin Ensemble Concert', 'Recital Hall', '2025-11-30', '20:00:00', 150, 0, 'CofC Violin Ensemble presents an evening of contemporary and classic violin', 'Music']);
    await client.query(eventInsertQuery, [5, 'Cougar Volleyball vs Charleston Southern', 'TD Arena', '2026-01-26', '19:00:00', 5100, 0, 'CofC Cougars take on Charleston Southern.', 'Sports']);
    await client.query(eventInsertQuery, [6, 'Cougar Basketball vs Charleston Southern', 'TD Arena', '2026-01-28', '19:00:00', 5100, 0, 'CofC Cougars take on Charleston Southern.', 'Sports']);
    console.log('✓ Sample events inserted');

    // Create sample auditoriums and seats for event 1
    console.log('\nCreating sample auditorium and seats for Basketball event...');
    
    const audResult = await client.query(`
      INSERT INTO auditoriums (event_id, name) VALUES (1, 'Main Court')
      ON CONFLICT DO NOTHING 
      RETURNING id
    `);

    const auditoriumId = audResult.rows[0]?.id || 1;

    // Create 400 seats
    const seatValues = [];
    for (let i = 0; i < 400; i++) {
      const row = Math.floor(i / 20) + 1;
      const col = (i % 20) + 1;
      const tier = i < 80 ? 'premium' : i < 240 ? 'standard' : 'economy';
      const price = i < 80 ? 85 : i < 240 ? 45 : 25;
      const isHandicap = i % 25 === 0;
      const isFaculty = (i % 30 === 0 && i < 60);
      
      seatValues.push([auditoriumId, i + 1, row, col, tier, price, isHandicap, isFaculty]);
    }
    
    for (const values of seatValues) {
        await client.query(`
            INSERT INTO seats (auditorium_id, seat_number, row_number, column_number, tier, price, is_handicap, is_faculty_only) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (auditorium_id, seat_number) DO NOTHING;
        `, values);
    }
    
    console.log('✓ Sample seats created');

    console.log('\n✅ Database initialization complete!');
    console.log('\nStart the server with: npm start');

  } catch (error) {
    console.error('Error initializing database:', error.message);
    throw error;
  } finally {
    if (client) {
      await client.end();
    }
  }
}

initializeDatabase()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });