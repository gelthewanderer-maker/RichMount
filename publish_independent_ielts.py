from pathlib import Path
from urllib.request import Request, urlopen
import hashlib

BASE = "https://ielts-practice-room.marturillas122813.chatgpt.site/"
FILES = {'questions.js': '833e5b6e2cbd16fc08ff360225535ec0f7e3dca662fc52b51968a40a098054a1', 'style.css': '66b28fcff7d92707db4d40d04b83db586a2a30e3072b65861e4017f2b88ed761', 'app.js': 'a0202d519029d810a9b9edc8c5eb76dd17ae1c45a00e997e5f058cfa977e026b', 'scoring.js': '977ad773fc094429013844a6532e0340a93f48df539f331d2b8503145b64c081', 'index.html': 'fa62098cbfbb2bbe6e60c418eb722614029f4989f72f126946451386ab80bdf8', 'audio/diagnostic-full.mp3': 'b8aca6c3ef4cdd1416ef86c3ecd5f0a377e8c8d43c09872b19dc00395c836706'}

output = Path("independent-ielts-public")
for name, expected in FILES.items():
    request = Request(BASE + name, headers={"User-Agent": "IELTS-Static-Publisher/1.0"})
    with urlopen(request, timeout=120) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != expected:
        raise RuntimeError("Source integrity check failed: " + name)
    target = output / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    print("Prepared", name, len(data), "bytes")
print("Standalone student site ready.")
