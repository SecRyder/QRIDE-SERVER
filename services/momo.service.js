const crypto = require("crypto");
const axios = require("axios");
const momoConfig = require("../config/momo.config");

function createSignature(rawData, secretKey) {
    return crypto
        .createHmac("sha256", secretKey)
        .update(rawData)
        .digest("hex");
}

async function createPayment(orderId, amount, orderInfo) {
    const requestId = orderId;

    const rawData =
        `accessKey=${momoConfig.accessKey}` +
        `&amount=${amount}` +
        `&extraData=` +
        `&ipnUrl=${momoConfig.ipnUrl}` +
        `&orderId=${orderId}` +
        `&orderInfo=${orderInfo}` +
        `&partnerCode=${momoConfig.partnerCode}` +
        `&redirectUrl=${momoConfig.redirectUrl}` +
        `&requestId=${requestId}` +
        `&requestType=${momoConfig.requestType}`;

    const signature = createSignature(rawData, momoConfig.secretKey);

    const body = {
        partnerCode: momoConfig.partnerCode,
        accessKey: momoConfig.accessKey,
        requestId,
        amount: amount.toString(),
        orderId,
        orderInfo,
        redirectUrl: momoConfig.redirectUrl,
        ipnUrl: momoConfig.ipnUrl,
        extraData: "",
        requestType: momoConfig.requestType,
        signature,
        lang: "vi"
    };

    const res = await axios.post(momoConfig.endpoint, body, {
        timeout: 10000
    });
    return res.data;
}

module.exports = { createPayment };