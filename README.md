# MineServer Web App

This is a small **Express + React/Vite** application meant to run on a **24/7 EC2 instance**.  
Its job:

- authenticate Minecraft users,  
- start the main Minecraft server on demand,  
- and authorize player IPs in AWS Firewall via a Lambda function.

This web app lives on a subpage (default: `/PlayMinecraft`).  
The Minecraft-server side of this system is here:  
👉 https://github.com/WarXenozord/MineServerMainApp

---

## 🚀 Getting Started

### 1. Clone the repo

\`\`\`bash
git clone https://github.com/WarXenozord/MineServerWebApp.git
cd MineServerWebApp
\`\`\`

### 2. Install all dependencies

\`\`\`bash
npm run install:all
\`\`\`

### 3. Build the Vite frontend

\`\`\`bash
npm run build
\`\`\`

### 4. Configure environment variables  
Copy and edit the template:

\`\`\`
Server/.env.template  →  Server/.env
\`\`\`

Fill everything in based on your AWS setup and your Minecraft supervisor API.

### 5. Using a different subpage?
If you change the \`SUBPAGE\`, update it inside:

\`\`\`
vite.config.ts
\`\`\`

It must match the path where your app will be hosted.

### 6. Start the app

\`\`\`bash
npm run start
\`\`\`

---

## 🔄 EC2 / Lambda Integration

This part handles the auto-start and firewall authorization loop.

### 1. Deploy the Lambda  
Inside the \`lambdas/\` folder, deploy the Lambda function to AWS.

### 2. Fix EC2 permissions  
Your EC2 instance must be allowed to call the Lambda.  
Add the correct IAM permissions (usually \`lambda:InvokeFunction\`).

### 3. Whitelist the web app server IP  
On your Minecraft server (the supervisor API), whitelist the IP of the machine running this web app so it can:

- trigger server startup,  
- authorize IPs,  
- and validate user sessions.