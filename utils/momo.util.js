const crypto = require("crypto");

function createSignature(rawData, secretKey) {
    return crypto
        .createHmac("sha256", secretKey)
        .update(rawData)
        .digest("hex");
}

function verifySignature(data, secretKey, accessKey) {
    const rawData =
        `accessKey=${accessKey}` +
        `&amount=${data.amount}` +
        `&extraData=${data.extraData}` +
        `&message=${data.message}` +
        `&orderId=${data.orderId}` +
        `&orderInfo=${data.orderInfo}` +
        `&orderType=${data.orderType}` +
        `&partnerCode=${data.partnerCode}` +
        `&payType=${data.payType}` +
        `&requestId=${data.requestId}` +
        `&responseTime=${data.responseTime}` +
        `&resultCode=${data.resultCode}` +
        `&transId=${data.transId}`;

    const signature = createSignature(rawData, secretKey);

    return signature === data.signature;
}

module.exports = { createSignature, verifySignature };