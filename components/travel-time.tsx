"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Car,
  Crosshair,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  TrainFront,
  Trash2,
} from "lucide-react";

import type { RouteSegment } from "@/components/promise-map";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LocationPicker, { type PickedLocation } from "@/components/location-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  addMyPlace,
  listMyPlaces,
  removeMyPlace,
  type MyPlace,
} from "@/lib/my-places";

// 약속 장소까지 얼마나 걸리는지 미리 보여준다.
//
// 출발지는 두 가지다.
//   - 지금 있는 곳 (위치 권한 필요)
//   - 내가 지정해둔 곳 (집·회사 등)
// 소요시간은 자동차 기준이다. 대중교통은 카카오가 API로 열어주지 않아서
// "길찾기" 버튼으로 카카오맵에 넘긴다.

const CURRENT = "__current__";

type Origin = { label: string; lat: number; lng: number };

type TransitOption = {
  durationSec: number;
  transfers: number;
  mode: string;
  fare: number | null;
  firstStation: string | null;
  mapObj: string | null;
};

type Routes = {
  car: { durationSec: number; distanceM: number; path: [number, number][] } | null;
  /** 빠른 순. 같은 방식은 하나만 들어 있다. */
  transit: TransitOption[] | null;
};

/** 지금 지도에 그리고 있는 것. 자동차는 "car", 대중교통은 목록에서의 순번. */
type Picked = "car" | number | null;

function formatDuration(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

function formatDistance(m: number): string {
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
}

/** 경로 한 줄. 누르면 지도에 그려지고, 그려진 줄은 칠해 둔다. */
function RouteRow({
  icon,
  title,
  detail,
  time,
  active,
  busy,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  time: string;
  active: boolean;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition
        ${
          active
            ? "bg-[var(--tk-ink)] text-[var(--tk-paper)]"
            : "bg-[var(--tk-ground)] text-[var(--tk-ink)] hover:brightness-95"
        }
        ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <span className={active ? "text-[var(--tk-paper)]/80" : "text-[var(--tk-sub)]"}>
        {busy ? <Loader2 className="size-4 shrink-0 animate-spin" /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="tk-meta block font-bold">{title}</span>
        <span
          className={`tk-caption mt-0.5 block truncate ${
            active ? "text-[var(--tk-paper)]/70" : "text-[var(--tk-faint)]"
          }`}
        >
          {detail}
        </span>
      </span>
      {active && <MapPin className="size-3.5 shrink-0 opacity-70" />}
      <span className="shrink-0 text-[19px] font-extrabold leading-none tracking-tight">
        {time}
      </span>
    </button>
  );
}

export default function TravelTime({
  destination,
  destinationName,
  onRouteChange,
}: {
  destination: { lat: number; lng: number } | null;
  destinationName: string;
  /** 고른 경로를 위 지도에 그리도록 넘긴다. null이면 지도를 원래대로 돌린다. */
  onRouteChange?: (route: RouteSegment[] | null) => void;
}) {
  const [places, setPlaces] = useState<MyPlace[]>([]);
  const [selected, setSelected] = useState<string>(CURRENT);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [originError, setOriginError] = useState<string | null>(null);

  const [routes, setRoutes] = useState<Routes | null>(null);
  const [routeState, setRouteState] = useState<"idle" | "loading" | "unavailable">("idle");

  const [picked, setPicked] = useState<Picked>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);

  // 소요시간 계산 effect 안에서 쓰는데, 부모가 새 함수를 넘길 때마다
  // 다시 계산하지 않도록 ref에 담아둔다.
  const onRouteChangeRef = useRef(onRouteChange);
  useEffect(() => {
    onRouteChangeRef.current = onRouteChange;
  }, [onRouteChange]);

  // 장소 추가 대화상자
  const [adding, setAdding] = useState(false);
  const [newPlace, setNewPlace] = useState<PickedLocation | null>(null);
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => {
    setPlaces(listMyPlaces());
  }, []);

  // ---------------- 출발지 정하기 ----------------
  const useCurrentPosition = useCallback(() => {
    setOriginError(null);
    if (!navigator.geolocation) {
      setOriginError("이 기기에서는 현재 위치를 쓸 수 없습니다.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setOrigin({
          label: "지금 있는 곳",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      () => setOriginError("위치를 허용하면 지금 있는 곳에서 계산합니다."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    );
  }, []);

  useEffect(() => {
    if (selected === CURRENT) {
      setOrigin(null);
      useCurrentPosition();
      return;
    }
    const place = places.find((p) => p.id === selected);
    if (place) {
      setOriginError(null);
      setOrigin({ label: place.label, lat: place.lat, lng: place.lng });
    }
  }, [selected, places, useCurrentPosition]);

  // ---------------- 소요시간 ----------------
  // 부모가 destination을 매번 새 객체로 넘겨도 다시 부르지 않도록 좌표 값으로 비교한다.
  const destLat = destination?.lat;
  const destLng = destination?.lng;

  useEffect(() => {
    if (!origin || destLat === undefined || destLng === undefined) {
      setRoutes(null);
      setRouteState("idle");
      return;
    }

    let cancelled = false;
    setRouteState("loading");
    // 출발지가 바뀌면 그리던 경로는 더 이상 맞지 않는다.
    setPicked(null);
    onRouteChangeRef.current?.(null);

    fetch("/api/directions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destLat, lng: destLng },
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Routes) => {
        if (cancelled) return;
        // 둘 다 못 가져왔으면 보여줄 게 없다.
        if (!data?.car && !data?.transit?.length) {
          setRoutes(null);
          setRouteState("unavailable");
          return;
        }
        setRoutes(data);
        setRouteState("idle");
      })
      .catch(() => {
        if (cancelled) return;
        setRoutes(null);
        setRouteState("unavailable");
      });

    return () => {
      cancelled = true;
    };
  }, [origin, destLat, destLng]);

  // ---------------- 경로를 지도에 그리기 ----------------
  const pick = async (next: Picked) => {
    setDrawError(null);

    // 같은 걸 다시 누르면 끈다 — 눌렀다 뒤로 가는 게 쉬워야 한다.
    if (next === picked || next === null) {
      setPicked(null);
      onRouteChange?.(null);
      return;
    }

    if (next === "car") {
      const path = routes?.car?.path;
      if (!path?.length) {
        setDrawError("자동차 경로를 그릴 수 없습니다.");
        return;
      }
      setPicked("car");
      onRouteChange?.([{ kind: "car", label: "자동차", color: "#16233F", points: path }]);
      return;
    }

    const option = routes?.transit?.[next];
    if (!option?.mapObj || !origin || destLat === undefined || destLng === undefined) {
      setDrawError("이 경로는 지도에 그릴 수 없습니다.");
      return;
    }

    setPicked(next);
    setDrawing(true);
    try {
      const res = await fetch("/api/directions/lane", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapObj: option.mapObj,
          origin: { lat: origin.lat, lng: origin.lng },
          destination: { lat: destLat, lng: destLng },
        }),
      });
      const data = (await res.json()) as { segments: RouteSegment[] | null };
      if (!data.segments) {
        setDrawError("노선 정보를 가져오지 못했습니다.");
        setPicked(null);
        onRouteChange?.(null);
        return;
      }
      onRouteChange?.(data.segments);
    } catch {
      setDrawError("노선 정보를 가져오지 못했습니다.");
      setPicked(null);
      onRouteChange?.(null);
    } finally {
      setDrawing(false);
    }
  };

  // ---------------- 카카오맵으로 넘기기 ----------------
  // 앱 안에서 못 그리는 것(실시간 교통, 상세 안내)은 지도 앱이 훨씬 잘한다.
  const kakaoMapUrl = destination
    ? `https://map.kakao.com/link/to/${encodeURIComponent(destinationName)},${destination.lat},${destination.lng}`
    : `https://map.kakao.com/link/search/${encodeURIComponent(destinationName)}`;

  const saveNewPlace = () => {
    if (!newPlace || !newLabel.trim()) return;
    const saved = addMyPlace({
      label: newLabel.trim(),
      address: newPlace.text,
      lat: newPlace.lat,
      lng: newPlace.lng,
    });
    setPlaces(listMyPlaces());
    setSelected(saved.id);
    setAdding(false);
    setNewPlace(null);
    setNewLabel("");
  };

  const deletePlace = (id: string) => {
    removeMyPlace(id);
    setPlaces(listMyPlaces());
    if (selected === id) setSelected(CURRENT);
  };

  return (
    <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
      <p className="mb-2.5 tk-label text-[var(--tk-faint)]">얼마나 걸릴까</p>

      {/* 출발지 고르기 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setSelected(CURRENT)}
          className={`tk-caption flex items-center gap-1 rounded-full px-3 py-2 transition ${
            selected === CURRENT
              ? "bg-[var(--tk-ink)] font-bold text-[var(--tk-paper)]"
              : "bg-[var(--tk-ground)] text-[var(--tk-ink)] hover:brightness-95"
          }`}
        >
          <Crosshair className="size-3.5" />
          지금 있는 곳
        </button>

        {places.map((p) => (
          <span key={p.id} className="group relative">
            <button
              type="button"
              onClick={() => setSelected(p.id)}
              title={p.address}
              className={`tk-caption rounded-full py-2 pl-3 pr-7 transition ${
                selected === p.id
                  ? "bg-[var(--tk-ink)] font-bold text-[var(--tk-paper)]"
                  : "bg-[var(--tk-ground)] text-[var(--tk-ink)] hover:brightness-95"
              }`}
            >
              {p.label}
            </button>
            <button
              type="button"
              onClick={() => deletePlace(p.id)}
              aria-label={`${p.label} 지우기`}
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 transition
                hover:bg-black/10 ${selected === p.id ? "text-[var(--tk-paper)]" : "text-[var(--tk-faint)]"}`}
            >
              <Trash2 className="size-3" />
            </button>
          </span>
        ))}

        <button
          type="button"
          onClick={() => setAdding(true)}
          className="tk-caption flex items-center gap-1 rounded-full border border-dashed
            border-[var(--tk-line)] px-3 py-2 text-[var(--tk-sub)] transition
            hover:bg-[var(--tk-ground)]"
        >
          <Plus className="size-3.5" />
          출발지 추가
        </button>
      </div>

      {/* 결과 */}
      <div className="mt-3.5">
        {originError ? (
          <p className="tk-meta rounded-xl bg-[var(--tk-ground)] px-4 py-3 text-[var(--tk-sub)]">
            {originError}
          </p>
        ) : !origin ? (
          <p className="tk-meta flex items-center gap-1.5 rounded-xl bg-[var(--tk-ground)] px-4 py-3 text-[var(--tk-faint)]">
            <Loader2 className="size-3.5 animate-spin" />위치 확인 중…
          </p>
        ) : !destination ? (
          <p className="tk-meta rounded-xl bg-[var(--tk-ground)] px-4 py-3 text-[var(--tk-sub)]">
            약속 장소에 좌표가 없어 계산할 수 없습니다.
          </p>
        ) : routeState === "loading" ? (
          <p className="tk-meta flex items-center gap-1.5 rounded-xl bg-[var(--tk-ground)] px-4 py-3 text-[var(--tk-faint)]">
            <Loader2 className="size-3.5 animate-spin" />계산 중…
          </p>
        ) : routeState === "unavailable" || !routes ? (
          <p className="tk-meta rounded-xl bg-[var(--tk-ground)] px-4 py-3 text-[var(--tk-sub)]">
            소요시간을 가져오지 못했습니다.
          </p>
        ) : (
          <>
            <p className="tk-caption mb-2 text-[var(--tk-faint)]">
              {picked === null
                ? `${origin.label}에서 출발 · 누르면 지도에 길이 보입니다`
                : `${origin.label}에서 출발 · 다시 누르면 지도를 되돌립니다`}
            </p>
            <ul className="space-y-1.5">
              {routes.transit?.map((t, i) => (
                <li key={`${t.mode}-${i}`}>
                  <RouteRow
                    icon={<TrainFront className="size-4 shrink-0" />}
                    title={t.mode}
                    detail={
                      (t.transfers > 0 ? `환승 ${t.transfers}회` : "환승 없음") +
                      (t.fare !== null ? ` · ${t.fare.toLocaleString("ko-KR")}원` : "") +
                      (t.firstStation ? ` · ${t.firstStation} 탑승` : "")
                    }
                    time={formatDuration(t.durationSec)}
                    active={picked === i}
                    busy={drawing && picked === i}
                    disabled={!t.mapObj}
                    onClick={() => pick(i)}
                  />
                </li>
              ))}

              {routes.car && (
                <li>
                  <RouteRow
                    icon={<Car className="size-4 shrink-0" />}
                    title="자동차"
                    detail={formatDistance(routes.car.distanceM)}
                    time={formatDuration(routes.car.durationSec)}
                    active={picked === "car"}
                    busy={false}
                    disabled={!routes.car.path?.length}
                    onClick={() => pick("car")}
                  />
                </li>
              )}
            </ul>

            {drawError && <p className="tk-caption mt-2 text-[var(--tk-warn)]">{drawError}</p>}

            {picked !== null && (
              <button
                type="button"
                onClick={() => pick(null)}
                className="tk-caption mt-2 w-full rounded-xl border border-[var(--tk-line)]
                  py-2.5 text-[var(--tk-sub)] transition hover:bg-[var(--tk-ground)]"
              >
                지도 되돌리기
              </button>
            )}
          </>
        )}
      </div>

      <Button asChild variant="outline" className="mt-2.5 h-11 w-full">
        <a href={kakaoMapUrl} target="_blank" rel="noreferrer">
          <Navigation className="size-4 mr-1.5" />
          카카오맵으로 길찾기
        </a>
      </Button>

      {/* 출발지 추가 */}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>출발지 추가</DialogTitle>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="place-label" className="tk-field-label text-[var(--tk-sub)]">
              이름
            </Label>
            <Input
              id="place-label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="집"
              maxLength={10}
              className="h-11 rounded-xl"
            />
          </div>

          <LocationPicker onSelect={setNewPlace} />

          {newPlace && (
            <p className="tk-meta text-[var(--tk-sub)]">고른 곳 · {newPlace.text}</p>
          )}

          <DialogFooter>
            <Button
              onClick={saveNewPlace}
              disabled={!newPlace || !newLabel.trim()}
              className="h-11 bg-[var(--tk-gold)] font-bold text-[var(--tk-ink)] hover:bg-[var(--tk-gold)]/90"
            >
              저장
            </Button>
          </DialogFooter>
          <p className="tk-caption text-[var(--tk-faint)]">
            이 기기에만 저장됩니다. 앱으로 옮길 때 계정에 저장되도록 바꿉니다.
          </p>
        </DialogContent>
      </Dialog>
    </section>
  );
}
