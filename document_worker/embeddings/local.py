import hashlib


def create_local_embedding(text: str, dimensions: int = 32) -> list[float]:
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    values = [digest[index % len(digest)] / 255.0 for index in range(dimensions)]
    magnitude = sum(value * value for value in values) ** 0.5 or 1.0
    return [round(value / magnitude, 8) for value in values]
