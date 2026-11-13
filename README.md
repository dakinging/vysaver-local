# VYSAVER — public deployment

## Deploy on Render
1. Push this folder's contents to a GitHub repository.
2. In Render, choose **New → Blueprint** and select the repository.
3. Render reads `render.yaml`, builds the Docker image, and gives the service a public `https://…onrender.com` URL.

The container binds to `0.0.0.0` and uses Render's `PORT` environment variable. yt-dlp is downloaded for the Linux host at startup; the macOS binary from the original archive is not reused on Linux.

## Run locally
```bash
cd app
npm ci
npm start
```
Open http://localhost:5000.

## Public-hosting notes
- Browser cookies from a visitor's computer are not accessible to a cloud server. Public deployments therefore support videos accessible without a personal browser login.
- Jobs and temporary files are held on the server and automatically removed after one hour. They are also lost when an ephemeral host restarts.
- The service limits each IP to five new jobs per hour and limits simultaneous processing to two jobs by default. Adjust with `MAX_JOBS_PER_HOUR` and `MAX_ACTIVE_JOBS`.
- Use only links and content you have permission to download. Do not use this service to bypass access controls or download private content.
- For production use, deploy on a host with sufficient CPU, RAM, disk, and outbound bandwidth. Video processing may exceed free-tier resource limits.
