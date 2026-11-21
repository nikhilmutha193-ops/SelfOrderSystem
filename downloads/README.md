# downloads

Put `PrintAgent.exe` here to offer it in the admin under **Printers & Stations -> Print computers -> Get the print agent**.

1. On a Windows PC with Node.js 20 or newer: `cd print-agent`, then `node build-exe.js` (writes `print-agent/dist/PrintAgent.exe`).
2. Copy that file into this folder on the server, for example
   `scp print-agent/dist/PrintAgent.exe root@your-server:/root/SelfOrderSystem/downloads/`.

The folder is mounted read-only into the server container at `/app/downloads`, so no rebuild or restart is needed:
the download button appears as soon as the file is there. The .exe itself is not kept in git (it is about 90 MB).
Each download is a zip with the exe and a `server.txt` holding the address the admin was opened on, so the setup window
opens with the website's address filled in and only the pairing code is left to type. Rebuild and copy the exe again
whenever `print-agent/agent.js` or `print-agent/setup-ui.html` changes.
