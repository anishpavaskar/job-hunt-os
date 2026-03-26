import twilio from "twilio";

type TwilioClient = ReturnType<typeof twilio>;

function getTwilioEnv() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: process.env.TWILIO_FROM_NUMBER,
    myPhoneNumber: process.env.MY_PHONE_NUMBER,
  };
}

export function isTwilioConfigured(): boolean {
  const { accountSid, authToken, fromNumber, myPhoneNumber } = getTwilioEnv();
  return Boolean(accountSid && authToken && fromNumber && myPhoneNumber);
}

function getClient(client?: TwilioClient): TwilioClient {
  if (client) return client;

  const { accountSid, authToken } = getTwilioEnv();
  if (!accountSid || !authToken) {
    throw new Error("Missing Twilio credentials. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.");
  }

  return twilio(accountSid, authToken);
}

export async function sendSMS(message: string, client?: TwilioClient): Promise<void> {
  const { fromNumber, myPhoneNumber } = getTwilioEnv();
  if (!fromNumber || !myPhoneNumber) {
    throw new Error("Missing Twilio phone numbers. Set TWILIO_FROM_NUMBER and MY_PHONE_NUMBER.");
  }

  await getClient(client).messages.create({
    body: message,
    from: fromNumber,
    to: myPhoneNumber,
  });
}

export async function sendDailyBriefingSMS(
  briefingUrl: string,
  newRoleCount: number,
  topScore: number,
  client?: TwilioClient,
): Promise<void> {
  const message = `☀️ ${newRoleCount} new roles today. Top score: ${topScore}. Doc: ${briefingUrl}`;
  await sendSMS(message, client);
}
