import dotenv from "dotenv";
dotenv.config();

const PAYSTACK_BASE_URL="https://api.paystack.co";

function getPaystackHeaders(){
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey){
        throw new Error("paystack secret key not found")
    }
    return {
        Authorization:`Bearer ${secretKey}`,
        "Content-Type": "application/json"
    };
};

export async function initializeTransaction(paymentData){
const response =await fetch(
    `${PAYSTACK_BASE_URL}/transaction/initialize`,
    {
        method: "POST",
        headers:getPaystackHeaders(),
        body: JSON.stringify(paymentData)
    }
);
const result = await response.json();

if (!response.ok || !result.status){
    throw new Error(result.message ||"payment initialization failed")
}
return result.data;
};

export async function verifyTransaction(reference){
    const response= await fetch(
        `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
        {
            method:"GET",
            headers: getPaystackHeaders()
        }
    );

    const result = await response.json();

    if(!response.ok || !result.status){
        throw new Error(
            result.message || "Payment verification failed"
        )
    }
    return result.data;
}

