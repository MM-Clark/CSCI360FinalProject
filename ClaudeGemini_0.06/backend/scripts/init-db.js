const mysql = require('mysql2/promise');
require('dotenv').config();

async function initializeDatabase() {
  let connection;
  
  try {
    // Connect without specifying database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || ''
    });

    console.log('Connected to MySQL server');

    // Create database if it doesn't exist
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'box_office_dragon'}`);
    console.log('Database created or already exists');

    // Use the database
    await connection.query(`USE ${process.env.DB_NAME || 'box_office_dragon'}`);

    // Create tables
    console.log('Creating tables...');

    // Users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('buyer', 'admin', 'enforcer') NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        discount DECIMAL(3,2) DEFAULT 0.00,
        has_accommodations BOOLEAN DEFAULT FALSE,
        handicap_accessible BOOLEAN DEFAULT FALSE,
        faculty_restricted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_username (username),
        INDEX idx_email (email)
      )
    `);
    console.log('✓ Users table created');

    // Events table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS events (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(200) NOT NULL,
        venue VARCHAR(100) NOT NULL,
        date DATE NOT NULL,
        time TIME NOT NULL,
        capacity INT NOT NULL,
        booked_seats INT DEFAULT 0,
        description TEXT,
        category VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_date (date),
        INDEX idx_venue (venue)
      )
    `);
    console.log('✓ Events table created');

    // Auditoriums table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS auditoriums (
        id INT PRIMARY KEY AUTO_INCREMENT,
        event_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        INDEX idx_event_id (event_id)
      )
    `);
    console.log('✓ Auditoriums table created');

    // Seats table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS seats (
        id INT PRIMARY KEY AUTO_INCREMENT,
        auditorium_id INT NOT NULL,
        seat_number INT NOT NULL,
        row_number INT NOT NULL,
        column_number INT NOT NULL,
        tier ENUM('premium', 'standard', 'economy') NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        is_handicap BOOLEAN DEFAULT FALSE,
        is_faculty_only BOOLEAN DEFAULT FALSE,
        is_booked BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (auditorium_id) REFERENCES auditoriums(id) ON DELETE CASCADE,
        INDEX idx_auditorium_id (auditorium_id),
        INDEX idx_is_booked (is_booked),
        UNIQUE KEY unique_seat (auditorium_id, seat_number)
      )
    `);
    console.log('✓ Seats table created');

    // Tickets table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        event_id INT NOT NULL,
        seat_id INT NOT NULL,
        original_price DECIMAL(10,2) NOT NULL,
        final_price DECIMAL(10,2) NOT NULL,
        qr_code VARCHAR(20) UNIQUE NOT NULL,
        alternate_id VARCHAR(10) UNIQUE NOT NULL,
        status ENUM('valid', 'used', 'invalid', 'transferred') DEFAULT 'valid',
        transferred_to_email VARCHAR(100),
        transferred_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (seat_id) REFERENCES seats(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_event_id (event_id),
        INDEX idx_qr_code (qr_code),
        INDEX idx_alternate_id (alternate_id),
        INDEX idx_status (status)
      )
    `);
    console.log('✓ Tickets table created');

    // Ticket History table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ticket_history (
        id INT PRIMARY KEY AUTO_INCREMENT,
        ticket_id VARCHAR(50) NOT NULL,
        action ENUM('created', 'transferred', 'returned', 'validated', 'used') NOT NULL,
        performed_by VARCHAR(50),
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
        INDEX idx_ticket_id (ticket_id),
        INDEX idx_created_at (created_at)
      )
    `);
    console.log('✓ Ticket history table created');

    // Insert dummy users
    console.log('\nInserting sample data...');
    
    await connection.query(`
      INSERT IGNORE INTO users (id, name, username, password_hash, role, email, discount) VALUES
      ('admin001', 'Sarah Chen', 'admin', '$2b$10$dummyhash1', 'admin', 'admin@cofc.edu', 0.00),
      ('enforcer001', 'Marcus Williams', 'enforcer', '$2b$10$dummyhash2', 'enforcer', 'enforcer@cofc.edu', 0.00),
      ('student001', 'Emily Rodriguez', 'student', '$2b$10$dummyhash3', 'buyer', 'student@cofc.edu', 0.10)
    `);
    console.log('✓ Sample users inserted');

    // Insert sample events
    await connection.query(`
      INSERT IGNORE INTO events (id, name, venue, date, time, capacity, booked_seats, description, category) VALUES
      (1, 'Cougar Basketball vs Citadel', 'TD Arena', '2025-11-25', '19:00:00', 5100, 0, 'CofC Cougars take on The Citadel Bulldogs.', 'Sports'),
      (2, 'Theatre: The Tempest', 'Emmett Robinson Theatre', '2025-12-05', '19:30:00', 240, 0, 'Shakespeare\'s final play performed by CofC Theatre students', 'Theatre'),
      (3, 'Jazz Ensemble Concert', 'Recital Hall', '2025-11-29', '20:00:00', 150, 0, 'CofC Jazz Ensemble presents an evening of contemporary and classic jazz', 'Music'),
      (4, 'Violin Ensemble Concert', 'Recital Hall', '2025-11-30', '20:00:00', 150, 0, 'CofC Violin Ensemble presents an evening of contemporary and classic violin', 'Music'),
      (5, 'Cougar Volleyball vs Charleston Southern', 'TD Arena', '2026-01-26', '19:00:00', 5100, 0, 'CofC Cougars take on Charleston Southern.', 'Sports'),
      (6, 'Cougar Basketball vs Charleston Southern', 'TD Arena', '2026-01-28', '19:00:00', 5100, 0, 'CofC Cougars take on Charleston Southern.', 'Sports')
    `);
    console.log('✓ Sample events inserted');

    // Create sample auditoriums and seats for event 1
    console.log('\nCreating sample auditorium and seats for Basketball event...');
    
    const [audResult] = await connection.query(`
      INSERT IGNORE INTO auditoriums (id, event_id, name) VALUES (1, 1, 'Main Court')
    `);

    // Create 400 seats
    const seatValues = [];
    for (let i = 0; i < 400; i++) {
      const row = Math.floor(i / 20) + 1;
      const col = (i % 20) + 1;
      const tier = i < 80 ? 'premium' : i < 240 ? 'standard' : 'economy';
      const price = i < 80 ? 85 : i < 240 ? 45 : 25;
      const isHandicap = i % 25 === 0 ? 1 : 0;
      const isFaculty = (i % 30 === 0 && i < 60) ? 1 : 0;
      
      seatValues.push([1, i + 1, row, col, tier, price, isHandicap, isFaculty]);
    }

    await connection.query(`
      INSERT IGNORE INTO seats 
      (auditorium_id, seat_number, row_number, column_number, tier, price, is_handicap, is_faculty_only) 
      VALUES ?
    `, [seatValues]);
    
    console.log('✓ Sample seats created');

    console.log('\n✅ Database initialization complete!');
    console.log('\nYou can now start the server with: npm start');
    console.log('\nDefault login credentials:');
    console.log('  Admin: username=admin, password=admin123');
    console.log('  Enforcer: username=enforcer, password=enforcer123');
    console.log('  Student: username=student, password=student123');

  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initializeDatabase()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });