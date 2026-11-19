# Deploying SelfOrder on a Docker server

This is the guide for putting the system on a server (a cloud VM, a VPS or a PC in the restaurant) with Docker.
For running it on a laptop, `docker-compose.yml` and the README are enough.

## What you get

| Container | What it does | Reachable from outside? |
|---|---|---|
| `client` | nginx with the web app. It also forwards `/api` and `/uploads` to the API. | Yes: ports 80 and 443 |
| `server` | The API (Node.js) | No |
| `mongo` | MongoDB as a single-node replica set (billing needs transactions) | No |
| `caddy` (optional) | Gets and renews a real HTTPS certificate for your domain | Yes: ports 80 and 443 |

Data lives in Docker volumes, so it survives rebuilds: `mongo_data` (database), `uploads_data` (images),
`backups_data` (daily backups), `invoices_data` (invoice PDFs), `proofs_data` (UPI screenshots) and `client_tls`.

## 1. Prepare the server

1. A Linux server with 2 GB of memory or more, and a user that can run Docker.
2. Install Docker Engine and the Compose plugin (Compose 2.24 or newer if you want the HTTPS add-on).
   Check with `docker --version` and `docker compose version`.
3. Open ports 80 and 443 in the server's firewall.
4. Copy the project to the server (`git clone`, or upload the folder).

## 2. Configure

```sh
cp .env.production.example .env
nano .env
```

Fill in at least:

- `JWT_SECRET`: a long random string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
- `RESTAURANT_KEY`: any short key, for example `resto_main`.
- `CLIENT_ORIGIN`: your site's address, for example `https://order.example.com` (or `http://<server-ip>` if you have no domain yet).

Keep the `.env` file private and back it up. Losing `JWT_SECRET` is not fatal, but changing it signs everyone out and makes
printed table QR codes stop working.

## 3. First install

```sh
./scripts/deploy.sh first
```

This builds the images, starts everything, waits for the API to be healthy and creates the restaurant with sample logins and a
sample menu. Then open your site:

- Admin: `/admin/login` with `admin` / `Admin@123`
- Kitchen: `/chef/login` with `chef1` / `Chef@123`
- Tables: `tbl1` to `tbl5` with `pass1` to `pass5`

**Change these passwords straight away.**

Without the script the same thing is:

```sh
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm seed
```

> Run the seed **once**, on a new database only.

## 4. HTTPS

A phone needs a secure connection (HTTPS) to use the camera for scanning table QR codes.

**With a real domain (recommended).** Point the domain's DNS at the server, then in `.env` set:

```
DOMAIN=order.example.com
CLIENT_ORIGIN=https://order.example.com
TRUST_PROXY_HOPS=2
```

and start with the HTTPS add-on:

```sh
HTTPS=1 ./scripts/deploy.sh first        # first install
HTTPS=1 ./scripts/deploy.sh update       # later updates
```

Caddy gets a Let's Encrypt certificate by itself and renews it. The app's own web server is then only reachable from the
server itself (`127.0.0.1:8080`).

**Without a domain (an IP address or a LAN).** The client container makes a self-signed certificate. Set
`TLS_EXTRA_SAN=IP:<the server's address>` in `.env` before the first start, and open `https://<address>`. Each device shows a
one-time certificate warning to accept.

## 5. Updating

```sh
./scripts/deploy.sh update       # add HTTPS=1 if you use it
```

It pulls the latest code, rebuilds, restarts and waits until the API is healthy. Your data is kept.

**Building elsewhere.** To avoid building on the server, build and push the two images from your own machine, then pull on the server:

```sh
IMAGE_REGISTRY=ghcr.io/your-name/selforder IMAGE_TAG=1.0.0 docker compose -f docker-compose.prod.yml build
IMAGE_REGISTRY=ghcr.io/your-name/selforder IMAGE_TAG=1.0.0 docker compose -f docker-compose.prod.yml push server client

# on the server (same two variables in .env):
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

**Rolling back.** Deploy the earlier version: `git checkout <earlier tag or commit>` then `./scripts/deploy.sh update`, or set
`IMAGE_TAG` to the earlier tag and run `up -d`.

## Automatic deploys with GitHub Actions

The file `.github/workflows/docker.yml` does this on every push to `master` (and every tag such as `v1.2.0`):

1. **Test**: builds and tests the server, builds the client.
2. **Images**: builds the server and client images and pushes them to GitHub's container registry as
   `ghcr.io/<owner>/selforder/server` and `.../client`, tagged `latest`, `sha-<commit>` and the version for tags.
3. **Deploy** (only if you switch it on): signs in to your VPS over SSH, pulls the new images and restarts the stack, then waits
   until the API is healthy.

Steps 1 and 2 work with no setup. To switch on step 3:

1. **A key for the robot.** On your computer: `ssh-keygen -t ed25519 -f deploy_key -N ""`. Add `deploy_key.pub` to
   `/home/selforder/.ssh/authorized_keys` on the VPS. Keep `deploy_key` (the private half) for the next step.
2. **A token to pull images.** On GitHub: Settings > Developer settings > Personal access tokens > create a token with only the
   `read:packages` permission. (If you make the two packages public you can skip this, but then anyone can download your images.)
3. **Secrets** (repository Settings > Secrets and variables > Actions > Secrets):

   | Secret | Value |
   |---|---|
   | `VPS_HOST` | the server's address |
   | `VPS_USER` | `selforder` |
   | `VPS_SSH_KEY` | the whole private key file |
   | `GHCR_READ_TOKEN` | the `read:packages` token |
   | `VPS_PORT` | only if SSH is not on port 22 |

4. **Variables** (same page, Variables tab): `DEPLOY_ENABLED` = `true`, and `DEPLOY_HTTPS` = `true` if you use the Caddy
   add-on (`docker-compose.https.yml`).
5. The server must already be set up as in `docs/VPS_DEPLOY.md` (cloned into `/opt/selforder`, with its `.env`).

After that, merging to `master` updates the restaurant system. The deploy writes `IMAGE_REGISTRY` and `IMAGE_TAG` into the server's
`.env`, so the server keeps using the images that were deployed. Once you use this, update with the workflow (or
`docker compose ... pull && up -d`), not with `./scripts/deploy.sh update`, which builds on the server instead.

To roll back, open Actions > Docker > Run workflow on an earlier commit, or set `IMAGE_TAG` in the server's `.env` to an earlier
`sha-...` tag and run `docker compose -f docker-compose.prod.yml up -d`.

> The private key is a password to your server. Create one just for deploys, never reuse your own, and never commit it.

## Cloudflare R2 storage

With the `R2_*` settings filled in, images and files go to Cloudflare R2 instead of Docker volumes, grouped under a folder named after
your `RESTAURANT_KEY` so several restaurants or environments can share a bucket:

| Bucket | Folders created |
|---|---|
| `R2_BUCKET` (public, served on `R2_PUBLIC_BASE_URL`) | `<RESTAURANT_KEY>/Banner`, `/Logo`, `/Product Image`, `/Team`, `/Awards` |
| `R2_PRIVATE_BUCKET` (private) | `<RESTAURANT_KEY>/Invoices`, `/Backups`, `/PaymentProofs` |

The folders are created for you each time the server starts. To create them by hand (for example before the first start):

```sh
docker compose -f docker-compose.prod.yml run --rm server node dist/utils/initStorage.js
# or, in the server folder:  npm run storage:init
```

R2 has no real folders: each one is an empty object whose name ends in `/`, which the Cloudflare dashboard shows as a folder.
Files saved before this layout keep working (their saved addresses do not change, and the server falls back to the old location when it
reads or deletes them). Do not set `R2_PRIVATE_BUCKET` to the same bucket as `R2_BUCKET`: private files must stay off the public bucket.

## Keeping the data safe

Everything that matters is in **one place: MongoDB's data folder** (plus the uploaded files). The containers themselves hold nothing, so you can
stop, remove and recreate them freely.

| Command | Data safe? |
|---|---|
| `docker compose ... down`, `up -d`, `restart`, `up --build`, `--force-recreate` | Yes. The volume stays and is reattached. |
| `docker compose ... down -v` | **No.** `-v` deletes the volumes. |
| `docker volume rm selfordersystem_mongo_data` | **No.** |
| `docker volume prune` or `docker system prune --volumes` | **No** if the stack is stopped: a volume no container uses counts as unused and is deleted. |
| Deleting the project folder | Yes for volumes (they live under `/var/lib/docker`), **no** for a data folder inside the project. |

### Option A: keep the default Docker volume
It already survives every recreate. Just never use `-v` or the prune commands above, and keep backups (section 6).
See where it is: `docker volume inspect selfordersystem_mongo_data --format '{{.Mountpoint}}'`.

### Option B: a normal folder on the server (recommended for real data)
A folder is not touched by any Docker clean-up command, is easy to back up and to move, and is visible with `ls`.

```sh
sudo mkdir -p /opt/selforder-data/mongo
sudo chown -R 999:999 /opt/selforder-data/mongo     # 999 is the "mongodb" user inside the image
echo 'MONGO_DATA_DIR=/opt/selforder-data/mongo' >> /root/SelfOrderSystem/.env
```

The folder must be owned by user 999 because the database runs as that user. A new, empty folder gives a new, empty database.

**Moving an existing database from the Docker volume into the folder** (about a minute of downtime):

```sh
cd /root/SelfOrderSystem
docker compose -f docker-compose.prod.yml down                 # no -v
sudo mkdir -p /opt/selforder-data/mongo
# copy the data out of the volume
docker run --rm -v selfordersystem_mongo_data:/from -v /opt/selforder-data/mongo:/to alpine sh -c 'cp -a /from/. /to/'
sudo chown -R 999:999 /opt/selforder-data/mongo
echo 'MONGO_DATA_DIR=/opt/selforder-data/mongo' >> .env
docker compose -f docker-compose.prod.yml up -d
```

Check the restaurant and its orders are there, and only then (after a few days and a backup) remove the old volume with `docker volume rm selfordersystem_mongo_data`.

### The uploaded files
Images, invoices, backups and payment screenshots are in the volumes `uploads_data`, `invoices_data`, `backups_data` and `proofs_data`. They behave the same way. With Cloudflare R2 set up (see below) images and private files are outside the server entirely, which is the safest option.

### Whatever you choose: back up
A volume or folder protects against recreating containers, not against a lost disk, a wrong command or a deleted server. Take the nightly backup (section 6) and copy it off the server.

## 6. Backups

- **In the app:** Admin > Backup and Restore has a daily backup and a restore (data only).
- **Whole server:** `./scripts/deploy.sh backup` writes the database dump and the files into `backup-<date>/`. Copy that folder
  off the server (another machine or cloud storage), and run it from a scheduler (cron) every night:

```
0 3 * * *  cd /opt/selforder && ./scripts/deploy.sh backup
```

To restore the database from a dump: `docker compose -f docker-compose.prod.yml exec -T mongo mongorestore --archive --gzip --drop < backup-<date>/mongo.archive.gz`.

## 7. Everyday commands

| Task | Command |
|---|---|
| See the state | `./scripts/deploy.sh status` |
| Follow the logs | `./scripts/deploy.sh logs` |
| Restart one service | `docker compose -f docker-compose.prod.yml restart server` |
| Stop everything (data kept) | `./scripts/deploy.sh stop` |
| Open a database shell | `docker compose -f docker-compose.prod.yml exec mongo mongosh selforder` |

Never run `docker compose down -v`: the `-v` deletes the data volumes.

## 8. Using MongoDB Atlas instead of the bundled database

Set `MONGO_URI` in `.env` to your Atlas connection string (an Atlas cluster is a replica set, so transactions work). Then remove the
`mongo` service and the two `depends_on` blocks that mention it from `docker-compose.prod.yml`, or leave it running unused.
Seed Atlas once with `./scripts/deploy.sh first` on a new database.

## 9. Printers

The server never talks to printers. Install the print agent (`print-agent/`) on a PC inside the restaurant's network, pair it from
Admin > Printers and Stations, and it reaches the server over the internet. See the print agent's README.

## 10. Checklist before going live

- [ ] `.env` filled in; `JWT_SECRET` is long and random; `CLIENT_ORIGIN` is your real address.
- [ ] `./scripts/deploy.sh status` shows every service healthy.
- [ ] Default passwords changed (Admin Users, Chefs, Tables).
- [ ] HTTPS works and a phone can scan a table QR.
- [ ] A test order was placed, sent to the kitchen, billed, settled and printed.
- [ ] Razorpay keys (test first) and the webhook address are set, if you take online payments.
- [ ] The nightly `deploy.sh backup` is scheduled and a copy leaves the server.
- [ ] The firewall allows only ports 22, 80 and 443.

## Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| `JWT_SECRET` or `CLIENT_ORIGIN` "is required" when starting | Fill them in `.env`. |
| Every request says "No restaurant found for key" | `RESTAURANT_KEY` does not match a seeded restaurant. Run the seed once. |
| The API stays "unhealthy" | `./scripts/deploy.sh logs`. Usually a wrong `MONGO_URI`, or MongoDB is still starting. |
| `docker top` shows MongoDB's `docker-entrypoint.sh` at 99% CPU, the log is empty and port 27017 refuses connections | The image's start-up script hangs on some servers. `docker-compose.prod.yml` runs `mongod` directly (`entrypoint: ["mongod"]`, `user: mongodb`); add those two lines to the `mongo` service if your copy is older. |
| The `mongo` container never becomes healthy (`Illegal instruction` in its logs) | The VPS CPU has no AVX, which MongoDB 5 and newer need. Set `MONGO_IMAGE=mongo:4.4` in `.env`, or use Atlas. |
| Billing fails with a transaction error | The database is not a replica set. Use the bundled `mongo` service or Atlas. |
| Caddy cannot get a certificate | DNS does not point at the server yet, or port 80 or 443 is blocked. |
| Guests are rate limited together | `TRUST_PROXY_HOPS` is wrong: 1 without Caddy, 2 with it. |
| Images are lost after an update | The `uploads_data` volume was removed. Restore from a backup; use R2 storage to avoid this. |
