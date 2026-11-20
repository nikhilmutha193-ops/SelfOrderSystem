# downloads

Put `PrintAgent.exe` here to offer it in the admin under **Printers & Stations -> Print computers -> Download**.

1. On a Windows PC with Node.js 20 or newer: `cd print-agent`, then `node build-exe.js` (writes `print-agent/dist/PrintAgent.exe`).
2. Copy that file into this folder on the server, for example
   `scp print-agent/dist/PrintAgent.exe root@your-server:/root/SelfOrderSystem/downloads/`.

The folder is mounted read-only into the server container at `/app/downloads`, so no rebuild or restart is needed:
the download button appears as soon as the file is there. The .exe itself is not kept in git (it is about 90 MB).
