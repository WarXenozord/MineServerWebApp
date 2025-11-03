import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import dotenv from "dotenv";

dotenv.config({ path: process.env.NODE_ENV === "production" ? "/etc/ms/.env" : "./.env" });

const lambda = new LambdaClient({
  region: process.env.AWS_REGION,
});

const USE_MOCK_LAMBDA = process.env.NODE_ENV !== "production";

export async function invokeStartServerLambda() {
  if (USE_MOCK_LAMBDA) {
    console.log("⚙️  Mock Lambda invoked locally");
    return { ok: true, message: "Local fake Lambda success" };
  }

  const command = new InvokeCommand({
    FunctionName: "start-minecraft-server",
    InvocationType: "RequestResponse",
    Payload: JSON.stringify({ start: true }),
  });

  const response = await lambda.send(command);
  return JSON.parse(Buffer.from(response.Payload).toString());
}