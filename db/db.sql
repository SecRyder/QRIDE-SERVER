DROP DATABASE IF EXISTS qride;
CREATE DATABASE qride;
USE qride;

-- ================== USERS ==================
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    phone VARCHAR(15) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    cccd VARCHAR(12) UNIQUE,
    address VARCHAR(255),
    gender ENUM('Nam','Nữ','Khác'),
    birthday DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_phone (phone)
);

-- ================== WALLET ==================
CREATE TABLE wallet (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    balance BIGINT DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'VND',
    status ENUM('active','locked') DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT chk_balance_non_negative CHECK (balance >= 0),
    INDEX idx_wallet_user (user_id)
);

-- Auto tạo wallet khi tạo user
DELIMITER $$
CREATE TRIGGER after_user_create
AFTER INSERT ON users
FOR EACH ROW
BEGIN
    INSERT INTO wallet (user_id, balance)
    VALUES (NEW.id, 0);
END$$
DELIMITER ;

-- ================== STATIONS ==================
CREATE TABLE stations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address VARCHAR(255),
    lat DOUBLE NOT NULL,
    lng DOUBLE NOT NULL,
    INDEX idx_station_location (lat, lng)
);

-- ================== VEHICLES ==================
CREATE TABLE vehicle (
    id INT AUTO_INCREMENT PRIMARY KEY,
    plate VARCHAR(20) UNIQUE,
    pin INT CHECK (pin >= 0 AND pin <= 100),
    station_id INT,
    current_status ENUM('available','renting','maintenance') DEFAULT 'available',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (station_id) REFERENCES stations(id),
    INDEX idx_vehicle_station (station_id),
    INDEX idx_vehicle_status (current_status),
    INDEX idx_vehicle_station_status (station_id, current_status)
);

-- ================== PRICING ==================
CREATE TABLE pricing (
	id INT AUTO_INCREMENT PRIMARY KEY,
    unlock_fee INT NOT NULL,
    price_per_minute INT NOT NULL,
    price_per_km INT DEFAULT 1000,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ================== RENTAL ==================
CREATE TABLE rental (
    id INT AUTO_INCREMENT PRIMARY KEY,
    vehicle_id INT NOT NULL,
    user_id INT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME DEFAULT NULL,
    start_lat DOUBLE,
    start_lng DOUBLE,
    end_lat DOUBLE,
    end_lng DOUBLE,
    total_distance DOUBLE DEFAULT 0,
    total_price INT DEFAULT 0,
    status ENUM('renting','done','cancelled') NOT NULL,
    payment_status ENUM('unpaid','paid','partial') DEFAULT 'unpaid',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_id) REFERENCES vehicle(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_rental_user (user_id),
    INDEX idx_rental_vehicle (vehicle_id),
    INDEX idx_rental_status (status),
    INDEX idx_rental_active (user_id, status)
);

-- ================== TRACKING GPS ==================
CREATE TABLE rental_tracking (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rental_id INT NOT NULL,
    lat DOUBLE NOT NULL,
    lng DOUBLE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rental_id) REFERENCES rental(id),
    INDEX idx_tracking_rental (rental_id),
    INDEX idx_tracking_time (created_at)
);

-- ================== PAYMENTS ==================
CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    rental_id INT,
    amount BIGINT NOT NULL,
    currency VARCHAR(10) DEFAULT 'VND',
    method ENUM('wallet','momo','zalopay','vnpay','bank'),
    status ENUM('pending','processing','success','failed','cancelled'),
    transaction_code VARCHAR(100),
    external_ref VARCHAR(100),
    description VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (rental_id) REFERENCES rental(id),
    UNIQUE (external_ref), -- chống duplicate MoMo
    CONSTRAINT chk_payment_amount CHECK (amount > 0),
    INDEX idx_user (user_id),
    INDEX idx_status (status),
    INDEX idx_method_status (method, status)
);

-- ================== PAYMENT TRANSACTIONS ==================
CREATE TABLE payment_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT NOT NULL,
    provider ENUM('momo','zalopay','vnpay'),
    request_id VARCHAR(100),
    order_id VARCHAR(100),
    trans_id VARCHAR(100),
    amount BIGINT,
    response_code VARCHAR(20),
    message VARCHAR(255),
    raw_response JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payment_id) REFERENCES payments(id),
    UNIQUE (trans_id)
);

-- ================== WALLET TRANSACTIONS ==================
CREATE TABLE wallet_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    wallet_id INT NOT NULL,
    payment_id INT NULL,
    rental_id INT NULL,
    amount BIGINT NOT NULL,
    type ENUM('topup','payment','refund','adjustment','hold','release','withdraw'),
    balance_before BIGINT,
    balance_after BIGINT,
    description VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_id) REFERENCES wallet(id),
    FOREIGN KEY (payment_id) REFERENCES payments(id),
    FOREIGN KEY (rental_id) REFERENCES rental(id),
    CONSTRAINT chk_wallet_amount CHECK (amount != 0),
    INDEX idx_wallet (wallet_id)
);

-- ================== SYSTEM CONFIG ==================
CREATE TABLE system_config (
    `key` VARCHAR(50) PRIMARY KEY,
    value VARCHAR(100)
);

INSERT INTO system_config VALUES
('min_wallet_to_rent', '20000'),
('low_balance_warning', '10000');

-- ================== DATA USERS ================== // Pass: Nguyet21@ + so cuoi dien thoai
INSERT INTO users (phone, password_hash, name, cccd, address, gender, birthday) VALUES
('0987654322', '$2b$10$FcYmPAGfEQoKjny8A4Ha9ep3CSAsWu/K7LEDV0qKp7QDEP6oHWeJ.', 'Người dùng 2', '001099000002', 'HCM', 'Nam', '2000-02-01'),
('0987654323', '$2b$10$FhyyqtpFSnNnlBNiOqaVLu7syJ9hd/DYvE4ooKVOpFbsp/jEzLJEe', 'Người dùng 3', '001099000003', 'HCM', 'Nữ', '2000-03-01'),
('0987654324', '$2b$10$f.beaMfXcGIgIFai0iJ3R.CufulMUS7GwxkkBOadW/v63qjAjTt4S', 'Người dùng 4', '001099000004', 'Bình Dương', 'Nam', '2000-04-01'),
('0987654325', '$2b$10$OmJkbmU.3FvaxLEzqdYyheGSV1miHTG3KsrxF/rAo8.m3pHaiC1iG', 'Người dùng 5', '001099000005', 'Bình Dương', 'Nữ', '2000-05-01'),
('0987654326', '$2b$10$Gx03E4drEXmGCxVpVIVi.ePgECchc1vZ76GfvmPAcFCNiOQH6T4k.', 'Người dùng 6', '001099000006', 'HCM', 'Nam', '2000-06-01'),
('0987654327', '$2b$10$3zTSNyuTPXaDxkjjzd/zM.S0ZsXqsQ.hUgGr4KkM.TD0K5cHqjhti', 'Người dùng 7', '001099000007', 'HCM', 'Nữ', '2000-07-01'),
('0987654328', '$2b$10$y8PLrhV03siV7VRqXOHJ0eIh5fO2.dvHk6gPLM3dCJc1.e1Qmutty', 'Người dùng 8', '001099000008', 'Hà Nội', 'Nam', '2000-08-01'),
('0987654329', '$2b$10$0DXQ/rWSaB23nBTeWTA1G.pBVfwb2kT66v.FORk8jlYrP4uN8YGhe', 'Người dùng 9', '001099000009', 'Hà Nội', 'Nam', '2000-09-01');


-- ================== DATA STATIONS ==================
INSERT INTO stations (name, address, lat, lng) VALUES
('Trạm Bến Thành', 'Q1', 10.7726, 106.6980),
('Trạm Lê Thánh Tôn', 'Q1', 10.7742, 106.6963),
('Trạm Hàm Nghi', 'Q1', 10.7710, 106.7030),
('Trạm Nguyễn Huệ', 'Q1', 10.7735, 106.7040),
('Trạm Nhà thờ Đức Bà', 'Q1', 10.7798, 106.6992),
('Trạm Landmark 81', 'Bình Thạnh', 10.7950, 106.7218),
('Trạm Thảo Điền', 'Q2', 10.8030, 106.7310),
('Trạm Vincom Thủ Đức', 'Thủ Đức', 10.8500, 106.7700),
('Trạm Suối Tiên', 'Thủ Đức', 10.8700, 106.8000),
('Trạm Bến xe Miền Đông', 'Bình Thạnh', 10.8100, 106.7100),
('Trạm PTIT Quận 9', 'Q9', 10.85304, 106.78409),
('Trạm Tô Vĩnh Diện','29 Tô Vĩnh Diện, Phú Lợi, Thủ Dầu Một, Bình Dương',10.9805,106.6643);

-- ================== DATA VEHICLES ==================
INSERT INTO vehicle (plate, pin, station_id, current_status) VALUES
('112-643', 100, 1, 'available'),
('113-222', 80, 1, 'available'),
('114-999', 60, 2, 'available'),
('115-123', 90, 3, 'available'),
('116-456', 70, 4, 'available'),
('117-888', 50, 5, 'available'),
('118-777', 30, 6, 'available'),
('119-666', 20, 7, 'available'),
('120-555', 85, 8, 'available'),
('121-444', 95, 9, 'available'),
('123-259', 95, 9, 'available'),
('124-259', 100, 11, 'available'),
('125-259', 98, 11, 'available'),
('126-259', 100, 11, 'available'),
('127-259', 100, 12, 'available');

-- ================== PRICING ==================
INSERT INTO pricing (unlock_fee, price_per_minute)
VALUES (5000, 500);

-- ================== SAMPLE TOPUP FLOW ==================

-- 1. Tạo payment
INSERT INTO payments (user_id, amount, method, status, transaction_code, external_ref)
VALUES (1, 50000, 'momo', 'success', 'TXN001', 'MOMO123');

-- 2. Log từ MoMo
INSERT INTO payment_transactions (payment_id, provider, trans_id, amount, response_code)
VALUES (1, 'momo', 'TRANS001', 50000, '0');

-- 3. Update wallet + transaction (giả lập)
UPDATE wallet SET balance = balance + 50000 WHERE user_id = 1;

INSERT INTO wallet_transactions (
    wallet_id, payment_id, amount, type,
    balance_before, balance_after, description
)
VALUES (
    1, 1, 50000, 'topup',
    0, 50000, 'Nạp tiền MoMo'
);

-- ================== SAMPLE RENTAL PAYMENT ==================

INSERT INTO rental (vehicle_id, user_id, start_time, status)
VALUES (1, 1, NOW(), 'renting');

-- giả lập kết thúc chuyến
UPDATE rental SET total_price = 15000, status = 'done' WHERE id = 1;

-- trừ tiền
UPDATE wallet SET balance = balance - 15000 WHERE user_id = 1;

INSERT INTO wallet_transactions (
    wallet_id, rental_id, amount, type,
    balance_before, balance_after, description
)
VALUES (
    1, 1, -15000, 'payment',
    50000, 35000, 'Thanh toán chuyến xe'
);

UPDATE rental SET payment_status = 'paid' WHERE id = 1;

-- ================== SAMPLE TRACKING ==================
INSERT INTO rental_tracking (rental_id, lat, lng) VALUES
(1, 10.7727, 106.6981),
(1, 10.7728, 106.6982);




