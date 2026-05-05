const express = require("express");
const router = express.Router();
const { verifySignature } = require("../utils/momo.util");

module.exports = (db) => {

    router.post("/ipn", async (req, res) => {
        console.log("Received MoMo IPN:", req.body);

        const data = req.body;

        if (!verifySignature(
            data,
            process.env.MOMO_SECRET_KEY,
            process.env.MOMO_ACCESS_KEY
        )) {
            return res.status(400).json({ message: "INVALID_SIGNATURE" });
        }

        const { orderId, resultCode, amount } = data;

        if (resultCode != 0) {
            return res.json({ message: "FAILED" });
        }

        const conn = await db.getConnection();

        try {
            await conn.beginTransaction();

            const [payments] = await conn.query(
                "SELECT * FROM payments WHERE external_ref=? FOR UPDATE",
                [orderId]
            );

            if (payments.length === 0) throw "PAYMENT_NOT_FOUND";

            const payment = payments[0];

            if (payment.status === "success") {
                await conn.commit();
                return res.json({ message: "ALREADY_DONE" });
            }

            if (parseInt(amount) !== payment.amount) {
                throw "AMOUNT_MISMATCH";
            }

            await conn.query(
                "UPDATE payments SET status='success' WHERE id=?",
                [payment.id]
            );

            const [walletRows] = await conn.query(
                "SELECT * FROM wallet WHERE user_id=? FOR UPDATE",
                [payment.user_id]
            );

            const wallet = walletRows[0];
            const newBalance = wallet.balance + payment.amount;

            await conn.query(
                "UPDATE wallet SET balance=? WHERE id=?",
                [newBalance, wallet.id]
            );

            await conn.commit();

            res.json({ message: "SUCCESS" });

        } catch (err) {
            await conn.rollback();
            res.status(500).json({ message: err.toString() });
        } finally {
            conn.release();
        }
    });

    return router;
};