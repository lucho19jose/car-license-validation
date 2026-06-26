"""
Cliente del Jetson: tras detectar una placa con el ALPR, la envía firmada al
Ingest API. Aquí va MOCK la detección; en el Jetson real reemplazas
`detectar_placas()` por la salida de tu modelo (DeepStream / LPR / OCR).

Requisitos:  pip install requests
"""
import hashlib
import hmac
import json
import time

import requests

API_URL = "http://localhost:3000/api/v1/plates"
API_KEY = "dev-api-key"
HMAC_SECRET = b"dev-hmac-secret"
CAMERA_ID = "cam-01"


def enviar_placa(plate: str, confidence: float, camera_id: str = CAMERA_ID) -> dict:
    body = json.dumps(
        {
            "plate": plate,
            "confidence": confidence,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "camera_id": camera_id,
        },
        separators=(",", ":"),  # sin espacios: el body firmado == el body enviado
    )
    sig = hmac.new(HMAC_SECRET, body.encode("utf-8"), hashlib.sha256).hexdigest()
    resp = requests.post(
        API_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Api-Key": API_KEY,
            "X-Signature": sig,
        },
        timeout=10,
    )
    print(f"[jetson] {plate} -> {resp.status_code} {resp.text}")
    return resp.json()


def detectar_placas():
    """MOCK. Reemplazar por la inferencia real del ALPR en el Jetson."""
    yield ("ALI582", 0.94)
    yield ("C3E040", 0.88)


if __name__ == "__main__":
    for plate, conf in detectar_placas():
        try:
            enviar_placa(plate, conf)
        except Exception as e:  # noqa: BLE001
            print(f"[jetson] error enviando {plate}: {e}")
        time.sleep(1)
