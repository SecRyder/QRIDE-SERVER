require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const bcrypt = require("bcrypt");
const momoService = require("./services/momo.service");
const jwt = require("jsonwebtoken");
const SECRET_KEY = process.env.SECRET;
if (!SECRET_KEY) {
    throw new Error("SECRET_KEY is required");
}

const app = express();
app.use(cors());
app.use(express.json());

// ================= DB =================
const db = mysql.createPool({
    host: "localhost",
    user: "root",
    password: process.env.DB_PASSWORD,
    database: "qride",
    waitForConnections: true,
    connectionLimit: 10
});

const momoRoute = require("./routes/momo.route");
app.use("/api/momo", momoRoute(db));

// ================= HELPER =================
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;

    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ================= TEST =================
app.get("/", (req, res) => {
    res.send("API Qride OK");
});

// ================= LOGIN =================
app.post("/api/login", async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password)
            return res.status(400).json({ message: "Thiếu dữ liệu" });

        const [rows] = await db.query(
            "SELECT * FROM users WHERE phone=?",
            [phone]
        );

        if (rows.length === 0)
            return res.status(401).json({ message: "Sai tài khoản hoặc mật khẩu" });

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch)
            return res.status(401).json({ message: "Sai tài khoản hoặc mật khẩu" });

        const token = jwt.sign(
            { userId: user.id, phone: user.phone },
            SECRET_KEY,
            { expiresIn: "7d" }
        );

        res.json({
            message: "Login success",
            token: token,
            user: {
                id: user.id,
                phone: user.phone,
                name: user.name
            }
        });

    } catch (err) {
        res.status(500).json({ message: "SERVER_ERROR" });
    }
});

function authMiddleware(req, res, next) {
    const authHeader = req.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "INVALID_TOKEN_FORMAT" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: "INVALID_TOKEN" });
    }
}

// ================= USER =================
app.get("/api/user", authMiddleware, async (req, res) => {
    const userId = req.user.userId;

    const [rows] = await db.query(
        "SELECT id, phone, name, cccd, address, gender, birthday FROM users WHERE id=?",
        [userId]
    );

    if (rows.length === 0)
        return res.status(404).json({ message: "USER_NOT_FOUND" });

    res.json(rows[0]);
});

// ================== UPDATE USER =================
app.post("/api/user/update", authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const { name, cccd, address, gender, birthday } = req.body;

    try {
        await db.query(
            `UPDATE users 
             SET name=?, cccd=?, address=?, gender=?, birthday=? 
             WHERE id=?`,
            [name, cccd, address, gender, birthday, userId]
        );

        res.json({ message: "SUCCESS" });
    } catch (err) {
        res.status(500).json({ message: "SERVER_ERROR" });
    }
});

// ================= CHECK PHONE =================
app.post("/api/check-phone", async (req, res) => {
    const [rows] = await db.query(
        "SELECT id FROM users WHERE phone=?",
        [req.body.phone]
    );

    res.json({ exists: rows.length > 0 });
});

app.get("/api/check-phone/:phone", async (req, res) => {
    const [rows] = await db.query(
        "SELECT id FROM users WHERE phone=?",
        [req.params.phone]
    );

    res.json({ exists: rows.length > 0 });
});

// ================= REGISTER =================
app.post("/api/register", async (req, res) => {
    const { phone, password, name, cccd, address, gender, birthday } = req.body;
    if (!phone || !password)
        return res.status(400).json({ message: "INVALID_INPUT" });
    const hash = await bcrypt.hash(password, 10);
    const [exist] = await db.query(
        "SELECT id FROM users WHERE phone=?",
        [phone]
    );
    if (exist.length > 0)
        return res.status(400).json({ message: "PHONE_EXISTS" });
    await db.query(
        `INSERT INTO users(phone, password_hash, name, cccd, address, gender, birthday)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [phone, hash, name, cccd, address, gender, birthday]
    );

    res.json({ message: "SUCCESS" });
});

app.post("/api/change-phone", authMiddleware, async (req, res) => {
    const { newPhone } = req.body;
    const userId = req.user.userId;

    await db.query(
        "UPDATE users SET phone=? WHERE id=?",
        [newPhone, userId]
    );

    res.json({ message: "SUCCESS" });
});

app.post("/api/reset-password", async (req, res) => {
    const { phone, newPassword } = req.body;

    if (!phone || !newPassword)
        return res.status(400).json({ message: "INVALID_INPUT" });

    const hash = await bcrypt.hash(newPassword, 10);

    const [result] = await db.query(
        "UPDATE users SET password_hash=? WHERE phone=?",
        [hash, phone]
    );

    if (result.affectedRows === 0)
        return res.status(404).json({ message: "USER_NOT_FOUND" });

    res.json({ message: "SUCCESS" });
});

// ================= VEHICLE =================
app.get("/api/vehicle/:id", async (req, res) => {
    const [rows] = await db.query(
        `SELECT v.*, s.name as station_name, s.address as station_address
         FROM vehicle v
         JOIN stations s ON v.station_id = s.id
         WHERE v.id=?`,
        [req.params.id]
    );

    if (rows.length === 0)
        return res.status(404).json({ message: "Not found" });

    res.json(rows[0]);
});

app.get("/api/vehicle-by-plate/:plate", async (req, res) => {
    const [rows] = await db.query(
        `SELECT v.*, s.name as station_name, s.address as station_address
         FROM vehicle v
         JOIN stations s ON v.station_id = s.id
         WHERE v.plate=?`,
        [req.params.plate]
    );

    if (rows.length === 0)
        return res.status(404).json({ message: "Not found" });

    res.json(rows[0]);
});

// ================= RENT =================
// app.post("/api/rent", async (req, res) => {
//     const { vehicleId, phone } = req.body;
app.post("/api/rent", authMiddleware, async (req, res) => {
    const { vehicleId } = req.body;
    if (!vehicleId) {
        return res.status(400).json({ message: "INVALID_VEHICLE_ID" });
    }
    const userId = req.user.userId;

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        // const [userRows] = await conn.query(
        //     "SELECT id FROM users WHERE phone=?",
        //     [phone]
        // );

        // if (userRows.length === 0)
        //     throw "User không tồn tại";

        // const userId = userRows[0].id;

        const [check] = await conn.query(
            "SELECT id FROM rental WHERE user_id=? AND status='renting'",
            [userId]
        );

        if (check.length > 0)
            throw new Error("Đang thuê xe");

        const [vehicles] = await conn.query(
            "SELECT * FROM vehicle WHERE id=? FOR UPDATE",
            [vehicleId]
        );

        if (vehicles.length === 0)
            throw "Không có xe";

        if (vehicles[0].current_status !== "available")
            throw "Xe không khả dụng";

        // ===== CHECK WALLET =====
        const [walletRows] = await conn.query(
            "SELECT * FROM wallet WHERE user_id=? FOR UPDATE",
            [userId]
        );

        if (walletRows.length === 0) {
            await conn.rollback();
            return res.json({ message: "NO_WALLET" });
        }

        const wallet = walletRows[0];

        // check trạng thái ví
        if (wallet.status !== "active") {
            await conn.rollback();
            return res.json({ message: "WALLET_LOCKED" });
        }

        // check số dư tối thiểu 20k
        // lấy config
        const [configRows] = await conn.query(
            "SELECT value FROM system_config WHERE `key`='min_wallet_to_rent'"
        );

        const minBalance = configRows.length > 0 ? parseInt(configRows[0].value) : 20000;

        // check số dư
        if (wallet.balance < minBalance) {
            await conn.rollback();
            return res.json({
                message: "NOT_ENOUGH_MONEY",
                balance: wallet.balance,
                need: minBalance
            });
        }

        const [result] = await conn.query(
            `INSERT INTO rental(vehicle_id, user_id, start_time, status)
             VALUES (?, ?, NOW(), 'renting')`,
            [vehicleId, userId]
        );


        await conn.query(
            "UPDATE vehicle SET current_status='renting' WHERE id=?",
            [vehicleId]
        );

        await conn.commit();

        res.json({ message: "SUCCESS", rental_id: result.insertId });

    } catch (err) {
        await conn.rollback();
        res.json({ message: err });
    } finally {
        conn.release();
    }
});

app.get("/api/wallet/check", authMiddleware, async (req, res) => {
    const userId = req.user.userId;

    const [walletRows] = await db.query(
        "SELECT * FROM wallet WHERE user_id=?",
        [userId]
    );

    if (walletRows.length === 0)
        return res.json({ message: "NO_WALLET" });

    const wallet = walletRows[0];

    const [configRows] = await db.query(
        "SELECT value FROM system_config WHERE `key`='min_wallet_to_rent'"
    );

    const minBalance = configRows.length > 0 ? parseInt(configRows[0].value) : 20000;

    res.json({
        balance: wallet.balance,
        min_required: minBalance,
        can_rent: wallet.balance >= minBalance
    });
});

// ================= RETURN =================
// app.post("/api/return", authMiddleware, async (req, res) => {
//     const { vehicleId, lat, lng } = req.body;

//     const conn = await db.getConnection();

//     try {
//         await conn.beginTransaction();

//         const userId = req.user.userId;

//         const [rentals] = await conn.query(
//             "SELECT * FROM rental WHERE vehicle_id=? AND user_id=? AND status='renting'",
//             [vehicleId, userId]
//         );

//         if (rentals.length === 0)
//             throw "NO_RENTAL";

//         const rental = rentals[0];

//         // ===== CHECK STATION =====
//         const [stations] = await conn.query("SELECT * FROM stations");

//         let minDistance = Infinity;

//         for (const s of stations) {
//             const d = getDistance(lat, lng, s.lat, s.lng);
//             if (d < minDistance) minDistance = d;
//         }

//         if (minDistance > 5000) {
//             await conn.rollback();
//             return res.json({
//                 message: "NOT_IN_STATION",
//                 distance: Math.floor(minDistance)
//             });
//         }

//         // ===== TÍNH THỜI GIAN =====
//         const startTime = new Date(rental.start_time);
//         const endTime = new Date();

//         const minutes = Math.ceil((endTime - startTime) / 60000);

//         // ===== LẤY PRICING =====
//         const [pricingRows] = await conn.query(
//             "SELECT * FROM pricing ORDER BY id DESC LIMIT 1"
//         );

//         const pricing = pricingRows[0] || {
//             price_per_minute: 1000,
//             unlock_fee: 5000
//         };

//         const totalPrice =
//             pricing.unlock_fee + (minutes * pricing.price_per_minute);

//         // ===== TRỪ TIỀN VÍ =====
//         const [walletRows] = await conn.query(
//             "SELECT * FROM wallet WHERE user_id=? FOR UPDATE",
//             [userId]
//         );

//         if (walletRows.length === 0) throw "NO_WALLET";

//         const wallet = walletRows[0];

//         if (wallet.balance < totalPrice) {
//             await conn.rollback();
//             return res.json({
//                 message: "NOT_ENOUGH_MONEY",
//                 balance: wallet.balance,
//                 need: totalPrice
//             });
//         }

//         const newBalance = wallet.balance - totalPrice;

//         // ===== UPDATE DB =====
//         await conn.query(
//             "UPDATE rental SET status='done', end_time=NOW(), total_price=? WHERE id=?",
//             [totalPrice, rental.id]
//         );

//         await conn.query(
//             "UPDATE vehicle SET current_status='available' WHERE id=?",
//             [vehicleId]
//         );

//         await conn.query(
//             "UPDATE wallet SET balance=? WHERE id=?",
//             [newBalance, wallet.id]
//         );

//         const [txResult] = await conn.query(
//             `INSERT INTO wallet_transactions
//             (wallet_id, amount, type, balance_before, balance_after, description)
//             VALUES (?, ?, 'payment', ?, ?, ?)`,
//             [
//                 wallet.id,
//                 totalPrice,
//                 wallet.balance,
//                 newBalance,
//                 "Thanh toán chuyến đi"
//             ]
//         );

//         const transactionId = txResult.insertId;

//         await conn.commit();

//         res.json({
//             message: "SUCCESS",
//             total_price: totalPrice,
//             minutes: minutes,
//             transaction_id: transactionId
//         });

//     } catch (err) {
//         await conn.rollback();
//         res.json({ message: err.toString() });
//     } finally {
//         conn.release();
//     }
// });

app.post("/api/return", authMiddleware, async (req, res) => {
    const { vehicleId, lat, lng } = req.body;

    if (!vehicleId || lat == null || lng == null) {
        return res.status(400).json({ message: "INVALID_INPUT" });
    }

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const userId = req.user.userId;

        const [rentals] = await conn.query(
            "SELECT * FROM rental WHERE vehicle_id=? AND user_id=? AND status='renting'",
            [vehicleId, userId]
        );

        if (rentals.length === 0) throw new Error("NO_RENTAL");

        const rental = rentals[0];

        // ===== CHECK STATION =====
        const [stations] = await conn.query("SELECT * FROM stations");

        let minDistance = Infinity;

        for (const s of stations) {
            const d = getDistance(lat, lng, s.lat, s.lng);
            if (d < minDistance) minDistance = d;
        }

        if (minDistance > 5000) {
            await conn.rollback();
            return res.json({
                message: "NOT_IN_STATION",
                distance: Math.floor(minDistance)
            });
        }

        // ===== TIME =====
        const startTime = new Date(rental.start_time);
        const minutes = Math.ceil((Date.now() - startTime.getTime()) / 60000);

        // ===== PRICING =====
        const [pricingRows] = await conn.query(
            "SELECT * FROM pricing ORDER BY id DESC LIMIT 1"
        );

        const pricing = pricingRows[0] || {
            unlock_fee: 5000,
            price_per_minute: 1000
        };

        const totalPrice =
            pricing.unlock_fee + minutes * pricing.price_per_minute;

        // ===== WALLET =====
        const [walletRows] = await conn.query(
            "SELECT * FROM wallet WHERE user_id=? FOR UPDATE",
            [userId]
        );

        if (walletRows.length === 0) throw new Error("NO_WALLET");

        const wallet = walletRows[0];

        if (wallet.balance < totalPrice) {
            await conn.rollback();
            return res.json({
                message: "NOT_ENOUGH_MONEY",
                balance: wallet.balance,
                need: totalPrice
            });
        }

        const newBalance = wallet.balance - totalPrice;

        // ===== UPDATE RENTAL =====
        await conn.query(
            `UPDATE rental 
             SET status='done', end_time=NOW(), total_price=?, payment_status='paid'
             WHERE id=?`,
            [totalPrice, rental.id]
        );

        // ===== UPDATE VEHICLE =====
        await conn.query(
            "UPDATE vehicle SET current_status='available' WHERE id=?",
            [vehicleId]
        );

        // ===== CREATE PAYMENT =====
        const [paymentResult] = await conn.query(
            `INSERT INTO payments(user_id, rental_id, amount, method, status)
             VALUES (?, ?, ?, 'wallet', 'success')`,
            [userId, rental.id, totalPrice]
        );

        const paymentId = paymentResult.insertId;

        // ===== UPDATE WALLET =====
        await conn.query(
            "UPDATE wallet SET balance=? WHERE id=?",
            [newBalance, wallet.id]
        );

        // ===== WALLET TRANSACTION =====
        const [txResult] = await conn.query(
            `INSERT INTO wallet_transactions
            (wallet_id, payment_id, rental_id, amount, type, balance_before, balance_after, description)
            VALUES (?, ?, ?, ?, 'payment', ?, ?, ?)`,
            [
                wallet.id,
                paymentId,
                rental.id,
                -totalPrice,
                wallet.balance,
                newBalance,
                "Thanh toán chuyến đi"
            ]
        );

        await conn.commit();

        res.json({
            message: "SUCCESS",
            rental_id: rental.id,
            transaction_id: txResult.insertId,
            total_price: totalPrice,
            minutes
        });

    } catch (err) {
        await conn.rollback();
        res.status(500).json({
            message: err.message || err.toString()
        });
    } finally {
        conn.release();
    }
});

app.get("/api/stations", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM stations");
        res.json(rows);
    } catch (err) {
        res.status(500).json(err);
    }
});

app.post("/api/tracking", authMiddleware, async (req, res) => {
    try {
        const { vehicleId, lat, lng } = req.body;
        if (!vehicleId || !lat || !lng) {
            return res.status(400).json({ message: "INVALID_INPUT" });
        }

        const userId = req.user.userId;

        const [rows] = await db.query(
            "SELECT id FROM rental WHERE vehicle_id=? AND user_id=? AND status='renting'",
            [vehicleId, userId]
        );

        if (rows.length === 0) {
            return res.json({ message: "No ride" });
        }

        await db.query(
            "INSERT INTO rental_tracking(rental_id, lat, lng) VALUES (?, ?, ?)",
            [rows[0].id, lat, lng]
        );

        res.json({ message: "Tracked" });

    } catch (err) {
        res.status(500).json({ message: "SERVER_ERROR" });
    }
});

// app.get("/api/history/:phone", async (req, res) => {
//     try {
//         const [rows] = await db.query(
//             `SELECT r.*, v.plate
//              FROM rental r
//              JOIN vehicle v ON r.vehicle_id = v.id
//              JOIN users u ON r.user_id = u.id
//              WHERE u.phone=? 
//              ORDER BY r.id DESC`,
//             [req.params.phone]
//         );

//         res.json(rows);

//     } catch (err) {
//         res.status(500).json(err);
//     }
// });
app.get("/api/history", authMiddleware, async (req, res) => {
    const userId = req.user.userId;

    const [rows] = await db.query(
        `SELECT r.*, v.plate
         FROM rental r
         JOIN vehicle v ON r.vehicle_id = v.id
         WHERE r.user_id=? 
         ORDER BY r.id DESC`,
        [userId]
    );

    res.json(rows);
});

app.get("/api/wallet", authMiddleware, async (req, res) => {
    const userId = req.user.userId;

    const [rows] = await db.query(
        "SELECT * FROM wallet WHERE user_id=?",
        [userId]
    );

    if (rows.length === 0)
        return res.status(404).json({ message: "NO_WALLET" });

    res.json(rows[0]);
});


// ================= API NAP TIEN ======================
// app.post("/api/wallet/topup", authMiddleware, async (req, res) => {
//     const { amount } = req.body;
//     if (!Number.isFinite(amount) || amount <= 0) {
//         return res.status(400).json({ message: "INVALID_AMOUNT" });
//     }
//     const userId = req.user.userId;

//     try {
//         const conn = await db.getConnection();
//         await conn.beginTransaction();

//         const [walletRows] = await conn.query(
//             "SELECT * FROM wallet WHERE user_id=? FOR UPDATE",
//             [userId]
//         );

//         if (walletRows.length === 0) throw "NO_WALLET";

//         const wallet = walletRows[0];
//         const newBalance = wallet.balance + amount;

//         const [paymentResult] = await conn.query(
//             `INSERT INTO payments(user_id, amount, method, status)
//              VALUES (?, ?, 'momo', 'success')`,
//             [userId, amount]
//         );

//         const paymentId = paymentResult.insertId;

//         await conn.query(
//             "UPDATE wallet SET balance=? WHERE id=?",
//             [newBalance, wallet.id]
//         );

//         await conn.query(
//             `INSERT INTO wallet_transactions(wallet_id, payment_id, amount, type, balance_before, balance_after, description)
//              VALUES (?, ?, ?, 'topup', ?, ?, ?)`,
//             [
//                 wallet.id,
//                 paymentId,
//                 amount,
//                 wallet.balance,
//                 newBalance,
//                 "Nạp tiền từ MoMo"
//             ]
//         );

//         await conn.commit();

//         res.json({ message: "SUCCESS", balance: newBalance });

//     } catch (err) {
//         await conn.rollback();
//         res.status(500).json({ message: err });
//     }
// });
app.post("/api/wallet/topup", authMiddleware, async (req, res) => {
    const { amount } = req.body;
    const userId = req.user.userId;

    if (!Number.isInteger(amount) || amount <= 0) {
        return res.status(400).json({ message: "INVALID_AMOUNT" });
    }

    const orderId = "ORDER_" + Date.now();

    try {
        const momoRes = await momoService.createPayment(
            orderId,
            amount,
            "Nap tien Qride"
        );

        await db.query(
            `INSERT INTO payments(user_id, amount, method, status, external_ref)
             VALUES (?, ?, 'momo', 'pending', ?)`,
            [userId, amount, orderId]
        );

        res.json({
            payUrl: momoRes.payUrl
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "MOMO_ERROR" });
    }
});


// =================== API RUT TIEN ==================
app.post("/api/wallet/withdraw", authMiddleware, async (req, res) => {
    const { amount } = req.body;
    const userId = req.user.userId;

    // ===== VALIDATE =====
    if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ message: "INVALID_AMOUNT" });
    }

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        // ===== LOCK WALLET =====
        const [walletRows] = await conn.query(
            "SELECT * FROM wallet WHERE user_id=? FOR UPDATE",
            [userId]
        );

        if (walletRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ message: "NO_WALLET" });
        }

        const wallet = walletRows[0];

        // ===== CHECK STATUS =====
        if (wallet.status !== "active") {
            await conn.rollback();
            return res.json({ message: "WALLET_LOCKED" });
        }

        // ===== LẤY MIN BALANCE (config) =====
        const [configRows] = await conn.query(
            "SELECT value FROM system_config WHERE `key`='min_wallet_balance'"
        );

        const minBalance = configRows.length > 0
            ? parseInt(configRows[0].value)
            : 10000;

        // ===== CHECK SỐ DƯ =====
        if (wallet.balance - amount < minBalance) {
            await conn.rollback();
            return res.json({
                message: "NOT_ENOUGH_MONEY",
                balance: wallet.balance,
                min_required: minBalance
            });
        }

        const newBalance = wallet.balance - amount;

        // ===== UPDATE WALLET =====
        await conn.query(
            "UPDATE wallet SET balance=? WHERE id=?",
            [newBalance, wallet.id]
        );

        // ===== LOG TRANSACTION =====
        await conn.query(
            `INSERT INTO wallet_transactions
            (wallet_id, amount, type, balance_before, balance_after, description)
            VALUES (?, ?, 'withdraw', ?, ?, ?)`,
            [
                wallet.id,
                amount,
                wallet.balance,
                newBalance,
                "Rút tiền về ví MoMo"
            ]
        );

        await conn.commit();

        res.json({
            message: "SUCCESS",
            amount: amount,
            balance: newBalance
        });

    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ message: "SERVER_ERROR" });
    } finally {
        conn.release();
    }
});

app.get("/api/pricing", async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT * FROM pricing ORDER BY id DESC LIMIT 1"
        );

        if (rows.length === 0)
            return res.json({ message: "NO_PRICING" });

        res.json(rows[0]);

    } catch (err) {
        res.status(500).json(err);
    }
});

// GET /api/wallet/history
// app.get("/api/wallet/history", authMiddleware, async (req, res) => {
//     const userId = req.user.userId;

//     try {
//         const [rows] = await db.query(
//             `SELECT 
//                 wt.id,
//                 wt.amount,
//                 wt.type,
//                 wt.description,
//                 wt.balance_after,
//                 wt.created_at
//              FROM wallet_transactions wt
//              WHERE wt.wallet_id IN (
//                 SELECT id FROM wallet WHERE user_id=?
//              )
//              ORDER BY wt.id DESC`,
//             [userId]
//         );

//         res.json(rows);

//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ message: "SERVER_ERROR" });
//     }
// });
app.get("/api/wallet/history", authMiddleware, async (req, res) => {
    const userId = req.user.userId;

    try {
        const [rows] = await db.query(
            `SELECT 
                wt.id,
                wt.amount,
                wt.type,
                wt.description,
                wt.balance_after,
                wt.rental_id,
                wt.created_at
             FROM wallet_transactions wt
             WHERE wt.wallet_id IN (
                SELECT id FROM wallet WHERE user_id=?
             )
             ORDER BY wt.id DESC`,
            [userId]
        );

        res.json(rows);

    } catch (err) {
        res.status(500).json({ message: "SERVER_ERROR" });
    }
});

// ================ CHI TIET GIAO DICH =============
// GET /api/transaction/:id
app.get("/api/transaction/:id", authMiddleware, async (req, res) => {
    const id = req.params.id;
    const userId = req.user.userId;

    try {
        const [rows] = await db.query(
            `SELECT wt.*, p.external_ref, p.method, p.status as payment_status
             FROM wallet_transactions wt
             LEFT JOIN payments p ON wt.payment_id = p.id
             WHERE wt.id=? 
             AND wt.wallet_id IN (
                SELECT id FROM wallet WHERE user_id=?
             )`,
            [id, userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "NOT_FOUND" });
        }

        const tx = rows[0];

        let rental = null;

        if (tx.rental_id) {
            const [r] = await db.query(
                `SELECT r.id, r.start_time, r.end_time, r.total_price, v.plate
                 FROM rental r
                 JOIN vehicle v ON r.vehicle_id = v.id
                 WHERE r.id=?`,
                [tx.rental_id]
            );

            if (r.length > 0) rental = r[0];
        }

        res.json({
            ...tx,
            rental
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
});

app.get("/api/transaction-by-rental/:rentalId", authMiddleware, async (req, res) => {
    const { rentalId } = req.params;
    const userId = req.user.userId;

    try {
        const [rows] = await db.query(
            `SELECT 
                r.id,
                r.start_time,
                r.end_time,
                r.total_price,
                v.plate
             FROM rental r
             JOIN vehicle v ON r.vehicle_id = v.id
             WHERE r.id=? AND r.user_id=?`,
            [rentalId, userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "NOT_FOUND" });
        }

        res.json(rows[0]);

    } catch (err) {
        res.status(500).json({ message: "SERVER_ERROR" });
    }
});






// ================= START =================
app.listen(3000, () => {
    console.log("Server running: http://localhost:3000");
});