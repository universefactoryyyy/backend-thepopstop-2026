-- The Pop Stop - Full Database
-- Drop current database and import this file in MySQL Workbench (XAMPP port 3306)
-- Admin login: admin@popstop.com / password
-- Sample discount codes: POPSTOP10, SAVE100, WELCOME50

DROP DATABASE IF EXISTS popstop_db;
CREATE DATABASE popstop_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE popstop_db;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin','customer') DEFAULT 'customer',
    token VARCHAR(500) DEFAULT NULL,
    is_active TINYINT(1) DEFAULT 1,
    deleted_at DATETIME DEFAULT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE customer (
    customer_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    fname VARCHAR(255),
    lname VARCHAR(255),
    addressline TEXT,
    zipcode VARCHAR(20),
    phone VARCHAR(30),
    image_path VARCHAR(500),
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    series VARCHAR(255),
    brand VARCHAR(255),
    price DECIMAL(10,2) NOT NULL,
    cost_price DECIMAL(10,2),
    sku VARCHAR(100) UNIQUE,
    description TEXT,
    stock_quantity INT DEFAULT 0,
    status ENUM('In Stock','Low Stock','Out of Stock') DEFAULT 'Out of Stock',
    image_url VARCHAR(500),
    deleted_at DATETIME DEFAULT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE product_photos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    photo_path VARCHAR(500),
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE cart (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT DEFAULT 1,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_cart (user_id, product_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE discounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255),
    discount_type ENUM('percent', 'fixed') NOT NULL DEFAULT 'percent',
    discount_value DECIMAL(10,2) NOT NULL,
    min_order_amount DECIMAL(10,2) DEFAULT 0,
    max_uses INT DEFAULT NULL,
    used_count INT DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    expires_at DATETIME DEFAULT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    subtotal_amount DECIMAL(10,2) DEFAULT 0,
    discount_code VARCHAR(50) DEFAULT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) DEFAULT 0,
    status ENUM('Pending','Processing','Shipped','Delivered','Cancelled') DEFAULT 'Pending',
    shipping_address TEXT,
    payment_method VARCHAR(100),
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    user_id INT NOT NULL,
    order_id INT NOT NULL,
    rating TINYINT NOT NULL,
    review_text TEXT,
    is_approved TINYINT(1) DEFAULT 1,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

INSERT INTO users (id, name, email, password, role, is_active, createdAt, updatedAt) VALUES
(1, 'Admin', 'admin@popstop.com', '$2b$10$Bn1vhfQEB59/Xcsb70apzu/RYluBD9/ASYMbWPb8EMV22hi2xI7t.', 'admin', 1, NOW(), NOW());

INSERT INTO products (id, name, series, brand, price, cost_price, sku, description, stock_quantity, status, image_url, deleted_at, createdAt, updatedAt) VALUES
(1, 'SKULLPANDA Covenant of the White Moon Figure', 'Skullpanda', 'Pop Mart', 1700.00, 1600.00, 'PM-SKP-001', 'SKULLPANDA Covenant of the White Moon Figure', 20, 'In Stock', 'images/skullpanda1.jpg', NULL, NOW(), NOW()),
(2, 'SKULLPANDA The Glimpse Figure', 'Skullpanda', 'Pop Mart', 1700.00, 1600.00, 'PM-SKP-002', 'SKULLPANDA The Glimpse Figure', 18, 'In Stock', 'images/skullpanda2.jpg', NULL, NOW(), NOW()),
(3, 'SKULLPANDA Club Man Figurine', 'Skullpanda', 'Pop Mart', 1700.00, 1600.00, 'PM-SKP-003', 'SKULLPANDA Club Man Figurine', 15, 'In Stock', 'images/skullpanda3.jpg', NULL, NOW(), NOW()),
(4, 'CRYBABY BE MINE FIGURINE', 'Crybaby', 'Pop Mart', 7280.00, 7180.00, 'PM-CRY-001', 'CRYBABY BE MINE FIGURINE', 5, 'Low Stock', 'images/crybaby1.jpg', NULL, NOW(), NOW()),
(5, 'CRYBABY MAKE ME FLOAT FIGURE', 'Crybaby', 'Pop Mart', 1700.00, 1600.00, 'PM-CRY-002', 'CRYBABY MAKE ME FLOAT FIGURE', 14, 'In Stock', 'images/crybaby2.jpg', NULL, NOW(), NOW()),
(6, 'Crybaby Coconut Figure-Brown', 'Crybaby', 'Pop Mart', 1700.00, 1600.00, 'PM-CRY-003', 'Crybaby Coconut Figure-Brown', 12, 'In Stock', 'images/crybaby3.jpg', NULL, NOW(), NOW()),
(7, 'Crybaby Coconut Figure-Green', 'Crybaby', 'Pop Mart', 1700.00, 1600.00, 'PM-CRY-004', 'Crybaby Coconut Figure-Green', 11, 'In Stock', 'images/crybaby4.jpg', NULL, NOW(), NOW()),
(8, 'LABUBU Hip-hop Girl Figure', 'The Monster', 'Pop Mart', 1700.00, 1600.00, 'PM-LAB-001', 'LABUBU Hip-hop Girl Figure', 25, 'In Stock', 'images/labubu1.jpg', NULL, NOW(), NOW()),
(9, 'LABUBU Superstar Dance Moves Figure', 'The Monster', 'Pop Mart', 1700.00, 1600.00, 'PM-LAB-002', 'LABUBU Superstar Dance Moves Figure', 22, 'In Stock', 'images/labubu2.jpg', NULL, NOW(), NOW()),
(10, 'THE MONSTERS_How to Train Your Dragon Figurine', 'The Monster', 'Pop Mart', 6000.00, 5900.00, 'PM-MON-001', 'THE MONSTERS_How to Train Your Dragon Figurine', 8, 'Low Stock', 'images/labubu3.jpg', NULL, NOW(), NOW()),
(11, 'PINO JELLY Chocolate Cookie Figurine', 'Pino Jelly', 'Pop Mart', 5000.00, 4900.00, 'PM-PIN-001', 'PINO JELLY Chocolate Cookie Figurine', 10, 'Low Stock', 'images/pino1.jpg', NULL, NOW(), NOW()),
(12, 'PINO JELLY Birthday Bash Figurine', 'Pino Jelly', 'Pop Mart', 5000.00, 4900.00, 'PM-PIN-002', 'PINO JELLY Birthday Bash Figurine', 12, 'In Stock', 'images/pino2.jpg', NULL, NOW(), NOW()),
(13, 'PINO JELLY Guess Who I am Figure', 'Pino Jelly', 'Pop Mart', 1700.00, 1600.00, 'PM-PIN-003', 'PINO JELLY Guess Who I am Figure', 18, 'In Stock', 'images/pino3.jpg', NULL, NOW(), NOW()),
(14, 'PINO JELLY Fairyland Figurine', 'Pino Jelly', 'Pop Mart', 5000.00, 4900.00, 'PM-PIN-004', 'PINO JELLY Fairyland Figurine', 9, 'Low Stock', 'images/pino4.jpg', NULL, NOW(), NOW()),
(15, 'Funko Marvel: Deadpool & Wolverine - Wolverine Pop! Vinyl Figure', 'Marvel', 'Funko', 695.00, 595.00, 'FK-MAR-001', 'Funko Marvel: Deadpool & Wolverine - Wolverine Pop! Vinyl Figure', 30, 'In Stock', 'images/funko1.jpg', NULL, NOW(), NOW()),
(16, 'Funko Marvel: Deadpool & Wolverine - Deadpool Pop! Vinyl Figure', 'Marvel', 'Funko', 695.00, 595.00, 'FK-MAR-002', 'Funko Marvel: Deadpool & Wolverine - Deadpool Pop! Vinyl Figure', 28, 'In Stock', 'images/funko2.jpg', NULL, NOW(), NOW()),
(17, 'Funko DC Comics Batman War Zone - The Joker War Joker Pop! Vinyl Figure', 'DC Comics', 'Funko', 695.00, 595.00, 'FK-DC-001', 'Funko DC Comics Batman War Zone - The Joker War Joker Pop! Vinyl Figure', 25, 'In Stock', 'images/funko3.jpg', NULL, NOW(), NOW()),
(18, 'Funko Bleach Ichigo Kurosaki (FB Shikai) Funko Pop! Vinyl Figure', 'Anime', 'Funko', 695.00, 595.00, 'FK-ANI-001', 'Funko Bleach Ichigo Kurosaki (FB Shikai) Funko Pop! Vinyl Figure', 20, 'In Stock', 'images/funko4.jpg', NULL, NOW(), NOW()),
(19, 'Funko Boruto: Naruto Next Generations Mirai Sarutobi Funko Pop! Vinyl Figure', 'Anime', 'Funko', 695.00, 595.00, 'FK-ANI-002', 'Funko Boruto: Naruto Next Generations Mirai Sarutobi Funko Pop! Vinyl Figure', 22, 'In Stock', 'images/funko5.jpg', NULL, NOW(), NOW()),
(20, 'Funko Spider-Man 2 Game Miles Morales Upgraded Suit Funko Pop! Vinyl Figure', 'Games', 'Funko', 695.00, 595.00, 'FK-GAM-001', 'Funko Spider-Man 2 Game Miles Morales Upgraded Suit Funko Pop! Vinyl Figure', 18, 'In Stock', 'images/funko6.jpg', NULL, NOW(), NOW()),
(21, 'Funko Demon Slayer Tengen Uzui Funko Pop! Vinyl Figure', 'Anime', 'Funko', 695.00, 595.00, 'FK-ANI-003', 'Funko Demon Slayer Tengen Uzui Funko Pop! Vinyl Figure', 24, 'In Stock', 'images/funko7.jpg', NULL, NOW(), NOW()),
(22, 'Funko My Hero Academia Katsuki Bakugo Funko Pop! Vinyl Figure - Previews Exclusive', 'Anime', 'Funko', 1195.00, 1095.00, 'FK-ANI-004', 'Funko My Hero Academia Katsuki Bakugo Funko Pop! Vinyl Figure - Previews Exclusive', 12, 'In Stock', 'images/funko8.jpg', NULL, NOW(), NOW()),
(23, 'Funko Black Clover Asta with Nero Funko Pop! Vinyl Figure', 'Anime', 'Funko', 695.00, 595.00, 'FK-ANI-005', 'Funko Black Clover Asta with Nero Funko Pop! Vinyl Figure', 19, 'In Stock', 'images/funko9.jpg', NULL, NOW(), NOW()),
(24, 'Funko One Piece Onami (Wano) Funko Pop! Vinyl Figure', 'Anime', 'Funko', 695.00, 595.00, 'FK-ANI-006', 'Funko One Piece Onami (Wano) Funko Pop! Vinyl Figure', 21, 'In Stock', 'images/funko10.jpg', NULL, NOW(), NOW());

INSERT INTO product_photos (product_id, photo_path, createdAt, updatedAt) VALUES
(1, 'images/skullpanda1.2.jpg', NOW(), NOW()),
(1, 'images/skullpanda1.3.jpg', NOW(), NOW()),
(2, 'images/skullpanda2.2.jpg', NOW(), NOW()),
(2, 'images/skullpanda2.3.jpg', NOW(), NOW()),
(3, 'images/skullpanda4.2.jpg', NOW(), NOW()),
(3, 'images/skullpanda4.3.jpg', NOW(), NOW()),
(4, 'images/crybaby1.2.jpg', NOW(), NOW()),
(4, 'images/crybaby1.3.jpg', NOW(), NOW()),
(5, 'images/crybaby2.2.jpg', NOW(), NOW()),
(5, 'images/crybaby2.3.jpg', NOW(), NOW()),
(6, 'images/crybaby3.2.jpg', NOW(), NOW()),
(6, 'images/crybaby3.3.jpg', NOW(), NOW()),
(7, 'images/crybaby4.2.jpg', NOW(), NOW()),
(7, 'images/crybaby4.3.jpg', NOW(), NOW()),
(8, 'images/labubu1.2.jpg', NOW(), NOW()),
(8, 'images/labubu1.3.jpg', NOW(), NOW()),
(9, 'images/labubu2.2.jpg', NOW(), NOW()),
(9, 'images/labubu2.3.jpg', NOW(), NOW()),
(10, 'images/labubu3.2.jpg', NOW(), NOW()),
(10, 'images/labubu3.3.jpg', NOW(), NOW()),
(11, 'images/pino1.2.jpg', NOW(), NOW()),
(11, 'images/pino1.3.jpg', NOW(), NOW()),
(12, 'images/pino2.2.jpg', NOW(), NOW()),
(12, 'images/pino2.3.jpg', NOW(), NOW()),
(13, 'images/pino3.2.jpg', NOW(), NOW()),
(13, 'images/pino3.3.jpg', NOW(), NOW()),
(14, 'images/pino4.2.jpg', NOW(), NOW()),
(14, 'images/pino4.3.jpg', NOW(), NOW()),
(15, 'images/funko1.2.jpg', NOW(), NOW()),
(15, 'images/funko1.3.png', NOW(), NOW()),
(16, 'images/funko2.2.jpg', NOW(), NOW()),
(16, 'images/funko2.3.png', NOW(), NOW()),
(17, 'images/funko3.2.png', NOW(), NOW()),
(18, 'images/funko4.2.png', NOW(), NOW()),
(19, 'images/funko5.2.png', NOW(), NOW()),
(20, 'images/funko6.2.png', NOW(), NOW()),
(21, 'images/funko7.2.png', NOW(), NOW()),
(22, 'images/funko8.2.jpg', NOW(), NOW()),
(23, 'images/funko9.2.png', NOW(), NOW()),
(24, 'images/funko10.2.png', NOW(), NOW());

INSERT INTO discounts (code, description, discount_type, discount_value, min_order_amount, max_uses, is_active) VALUES
('POPSTOP10', '10% off your order', 'percent', 10.00, 500.00, 100, 1),
('SAVE100', 'P100 off orders P1000+', 'fixed', 100.00, 1000.00, 50, 1),
('WELCOME50', 'P50 welcome discount', 'fixed', 50.00, 300.00, NULL, 1);
