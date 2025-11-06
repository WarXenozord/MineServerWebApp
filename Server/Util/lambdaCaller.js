import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import dotenv from "dotenv";

dotenv.config({ path: process.env.NODE_ENV === "production" ? "/etc/ms/.env" : "./.env" });

const USE_MOCK_LAMBDA = process.env.NODE_ENV !== "production";

const lambda = USE_MOCK_LAMBDA ? null : new LambdaClient({
  region: process.env.AWS_REGION,
});

/**
 * Calls (or simulates) the Lambda function responsible for starting the Minecraft server.
 * In development mode, returns a fake local IP immediately.
 */
export async function invokeStartServerLambda() {
  if (USE_MOCK_LAMBDA) {
    console.log("⚙️  Mock Lambda: starting local dev server...");
    // Simulate boot delay and return mock IP
    await new Promise(r => setTimeout(r, 1500));
    return { ok: true, ip: "localhost", message: "Mock Lambda started local dev server" };
  }

  const command = new InvokeCommand({
    FunctionName: process.env.LAMBDA_NAME || "start-minecraft-server",
    InvocationType: "RequestResponse",
    Payload: JSON.stringify({ action: "startServer" }),
  });

  const response = await lambda.send(command);
  const payloadStr = Buffer.from(response.Payload).toString();
  try {
    return JSON.parse(payloadStr);
  } catch (e) {
    console.error("Lambda payload parse failed:", payloadStr);
    throw e;
  }
}