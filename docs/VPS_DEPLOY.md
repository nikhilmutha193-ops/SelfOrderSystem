# Deploying SelfOrder on a VPS (step by step)

This takes a brand-new rented server (DigitalOcean, Hetzner, Linode, AWS Lightsail, Contabo, any VPS) to a live restaurant system
with a real HTTPS address. It builds on `docs/DEPLOY.md`, which explains the Docker files themselves.

Time needed: about 30 minutes, plus waiting for DNS.

## 1. Choose the server

| | Minimum | Comfortable |
|---|---|---|
| Memory | 2 GB | 4 GB |
| CPU | 1 vCPU | 2 vCPU |
| Disk | 25 GB | 50 GB |
| System | Ubuntu 22.04 or 24.04 LTS | Ubuntu 24.04 LTS |

- Pick a region close to the restaurant. A guest's phone talks to the server for every tap.
- The server needs a fixed public IP address, which every VPS gives you.
- 2 GB is enough to run it; the first build can need more memory, so the setup script adds swap on small servers.

## 2. Point a domain at it

Buy or use a domain (for example `example.com`) and add an **A record**:

| Name | Type | Value |
|---|---|---|
| `order` | A | the server's public IP |

That makes `order.example.com`. DNS can take a few minutes to a few hours. Check with `nslookup order.example.com`.
If you use Cloudflare, set the record to **DNS only** (grey cloud) until the certificate has been issued.

## 3. Prepare the server (once)

From your computer, sign in as root with your SSH key:

```sh
ssh root@<server ip>
```

Copy `scripts/vps-setup.sh` to the server (or download the repository there) and run it:

```sh
sh vps-setup.sh selforder https://github.com/<you>/<repo>.git
```

It installs Docker, turns on a firewall that only allows SSH, 80 and 443, installs fail2ban and automatic security updates, adds
swap if memory is small, creates the login `selforder`, and clones the project into `/opt/selforder`.

> Before closing the root session, open a second terminal and check that `ssh selforder@<server ip>` works.

If the repository is private, upload the folder instead, for example from your computer:

```sh
scp -r ./SelfOrderSystem selforder@<server ip>:/opt/selforder
```

(leave out `node_modules`, `dist` and `.env`).

## 4. Configure

```sh
ssh selforder@<server ip>
cd /opt/selforder
cp .env.production.example .env
nano .env
```

Set these (the rest can stay as it is):

```
JWT_SECRET=<64 random characters>
RESTAURANT_KEY=resto_main
DOMAIN=order.example.com
CLIENT_ORIGIN=https://order.example.com
TRUST_PROXY_HOPS=2
```

Make the secret with `openssl rand -hex 32`. Then protect the file: `chmod 600 .env`.

## 5. First start

```sh
HTTPS=1 ./scripts/deploy.sh first
```

(or `HTTPS=1 sh scripts/deploy.sh first` if the script is not executable; fix that once with `chmod +x scripts/deploy.sh`).

This builds the images (a few minutes the first time), starts the database, API, web server and Caddy, waits for the API to be
healthy, and creates the restaurant with sample logins and a sample menu. Caddy then requests a certificate for your domain.

Open `https://order.example.com/admin/login` and sign in with `admin` / `Admin@123`. **Change the passwords now**: Admin >
Change password, then Admin Users, Chefs and Tables.

## 6. Check that it works

- `./scripts/deploy.sh status` shows every service `healthy` or `running`.
- The browser shows a padlock, no certificate warning.
- From a phone on mobile data (not your Wi-Fi), open `https://order.example.com/order`, sign in to `tbl1` / `pass1`, and the camera
  scanner opens when you tap Scan.
- Place a test order, send it to the kitchen, bill it and settle it.

If the certificate fails, run `./scripts/deploy.sh logs` and look for `caddy`. The usual causes are DNS not pointing at the
server yet, or ports 80 and 443 blocked by the **provider's** own firewall (many providers have one in their web dashboard as well
as the server's).

## 7. Staying up after a reboot

Every service has `restart: always` and Docker starts at boot, so after a reboot or a crash everything comes back by itself.
Check once: `sudo reboot`, wait two minutes, reopen the site.

## 8. Backups (do this on day one)

A VPS disk is not a backup. Two layers:

1. **Nightly dump on the server.** Add a schedule: `crontab -e`, then

   ```
   0 3 * * *  cd /opt/selforder && HTTPS=1 ./scripts/deploy.sh backup >> /var/log/selforder-backup.log 2>&1
   ```

   The script keeps the last 14 days (change with `KEEP_DAYS`).
2. **A copy off the server.** Use your provider's snapshots/backups (usually a few dollars a month), and also copy the
   `backup-*` folders elsewhere, for example with `rclone` to cloud storage, or `scp` to another machine.

Also turn on the daily backup inside the app (Admin > Backup and Restore). Test a restore on a spare machine once.

## 9. Updating

When new code is ready:

```sh
cd /opt/selforder
HTTPS=1 ./scripts/deploy.sh update
```

It pulls the new code, rebuilds, restarts and waits until the API is healthy. The restaurant sees a few seconds of interruption.
Do this outside service hours. To go back: `git checkout <earlier commit or tag>` and run the same command.

## 10. Keeping it healthy

- **Uptime alert.** Add the address `https://order.example.com/health` (the API's own check, which also tests the database) to a free monitor such as
  UptimeRobot, with an email or phone alert.
- **Disk space.** `df -h` now and then. Logs are already capped. `docker system df` shows what Docker uses; `docker image prune -f`
  clears old images (the update script does this).
- **Memory.** `docker stats --no-stream`. If the server often runs out of memory, move to a 4 GB plan.
- **Security updates** install by themselves. Reboot monthly: `sudo reboot`.
- **Logs.** `./scripts/deploy.sh logs`.

## 11. Security notes

- Docker publishes ports straight to the internet and **bypasses the UFW firewall**. That is why this setup publishes nothing except
  Caddy on 80 and 443, and keeps MongoDB and the API unpublished. Do not add `ports:` for `mongo` or `server`.
- Sign in by SSH key only. Once your key works, set `PasswordAuthentication no` in `/etc/ssh/sshd_config` and run
  `sudo systemctl restart ssh`.
- Keep `.env` private (`chmod 600`) and never commit it.
- Use the provider's firewall as a second layer: allow only 22, 80 and 443.
- Restaurant Wi-Fi: only the **print agent PC** needs to reach the server (outbound over HTTPS). Nothing needs to reach into the
  restaurant.

## 12. Printers at the restaurant

The VPS cannot see a printer on the restaurant's network. Install the print agent (`print-agent/`) on a PC at the restaurant, pair
it in Admin > Printers and Stations with the server address `https://order.example.com`, and it fetches print jobs over the
internet and sends them to the printer locally.

## Troubleshooting

| Problem | What to do |
|---|---|
| `Permission denied` running Docker | Sign out and in again so the `docker` group applies, or use `sudo`. |
| Build is killed or very slow | Not enough memory: check `free -h`, add swap (the setup script does) or use a bigger plan. |
| Site loads but guests cannot sign in | `CLIENT_ORIGIN` does not match the address in the browser, or it is `http` while the site is `https`. |
| Guests get "Too many requests" | `TRUST_PROXY_HOPS` should be 2 with Caddy. Fix it in `.env`, then `HTTPS=1 ./scripts/deploy.sh update`. |
| Certificate error after changing the domain | `HTTPS=1 docker compose -f docker-compose.prod.yml -f docker-compose.https.yml restart caddy` after fixing DNS. |
| Lost the `.env` file | Recreate it. A new `JWT_SECRET` signs everyone out and invalidates printed QR codes; print new ones. |
| Moving to a new VPS | Run a backup, set up the new server (steps 3 to 5 without the seed), then restore the database with `mongorestore` and unpack the file archives into the volumes. See `docs/DEPLOY.md`, section 6. |
