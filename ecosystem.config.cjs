module.exports = {
  apps: [
    {
      name: "pi-listening-lab",
      cwd: "/home/ubuntu/pi-listening-lab",
      script: "npm",
      args: "start -- --hostname 0.0.0.0 --port 3000",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "0.0.0.0",
      },
      max_memory_restart: "1G",
      autorestart: true,
      time: true,
    },
  ],
};
