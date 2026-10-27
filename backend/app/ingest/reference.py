"""Loads the shared reference files in src/data/reference (also used by the frontend)."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from ..providers.base import Point


@dataclass
class CorridorRef:
    id: str
    name: str
    route_code: str
    waypoints: list[Point]


@dataclass
class OdPairRef:
    id: str
    name: str
    origin_name: str
    origin: Point
    destination_name: str
    destination: Point


def load_corridors(reference_dir: Path) -> list[CorridorRef]:
    data = json.loads((reference_dir / "corridors.json").read_text())
    return [
        CorridorRef(c["id"], c["name"], c["routeCode"], [Point(lat, lon) for lat, lon in c["waypoints"]])
        for c in data["corridors"]
    ]


def load_od_pairs(reference_dir: Path) -> list[OdPairRef]:
    data = json.loads((reference_dir / "od_pairs.json").read_text())
    return [
        OdPairRef(
            p["id"],
            p["name"],
            p["origin"]["name"],
            Point(p["origin"]["lat"], p["origin"]["lon"]),
            p["destination"]["name"],
            Point(p["destination"]["lat"], p["destination"]["lon"]),
        )
        for p in data["od_pairs"]
    ]
