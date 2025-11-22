import {
  EC2Client,
  StartInstancesCommand,
  DescribeInstancesCommand,
} from "@aws-sdk/client-ec2";

const INSTANCE_ID = process.env.INSTANCE_ID;
const REGION = process.env.AWS_REGION || "sa-east-1";

const ec2 = new EC2Client({ region: REGION });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export const handler = async (event) => {
  if (!event || event.action !== "startServer") {
    return { ok: false, message: "Invalid action" };
  }

  if (!INSTANCE_ID) {
    return { ok: false, message: "INSTANCE_ID not set" };
  }

  try {
    // 1. Start the instance
    await ec2.send(
      new StartInstancesCommand({
        InstanceIds: [INSTANCE_ID],
      })
    );

    // 2. Wait a bit for AWS to assign the public IP 
    // TODO: refactor to step function
    await sleep(10000); // 10 seconds

    // 3. Fetch instance metadata again
    const res = await ec2.send(
      new DescribeInstancesCommand({
        InstanceIds: [INSTANCE_ID],
      })
    );

    const instance = res.Reservations?.[0]?.Instances?.[0];

    if (!instance)
      return { ok: false, message: "Instance not found" };

    const ip = instance.PublicIpAddress || null;

    return {
      ok: true,
      ip,
      state: instance.State?.Name,
      message: ip
        ? "Instance starting with public IP assigned"
        : "Instance starting but public IP not ready yet",
    };

  } catch (err) {
    return {
      ok: false,
      message: err.message,
    };
  }
};