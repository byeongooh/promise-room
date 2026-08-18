"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bookmark,
  Car,
  ChevronDown,
  Crosshair,
  Footprints,
  Loader2,
  Moon,
  Navigation,
  TrainFront,
  Trash2,
} from "lucide-react";

import type { RoutePoint, RouteSegment } from "@/components/promise-map";

/** 지도에 넘길 한 벌 — 선과 점을 같이 준다. */
export interface DrawnRoute {
  segments: RouteSegment[];
  points: RoutePoint[];
}
import OriginSearch, { type FoundPlace } from "@/components/origin-search";
import { Button } from "@/components/ui/button";
import { addMyPlace, listMyPlaces, removeMyPlace, type MyPlace } from "@/lib/my-places";
import { RouteFailed, RouteSkeleton } from "@/components/route-states";
import { updateMyMember } from "@/lib/api-client";
import type { MemberRoute } from "@/lib/types";

// 약속 장소까지 어떻게, 얼마나 걸려 가는지.
//
// 목적지는 약속 장소로 이미 정해져 있다. 사용자는 출발지만 정하면 되고,
// 그러면 대중교통·자동차 경로 후보가 빠른 순으로 뜬다. 하나를 누르면
// 위 지도에 그 길이 그려지고 무엇을 타는지 단계가 펼쳐진다.

const CURRENT = "__current__";

type Origin = { label: string; lat: number; lng: number };

type TransitStep = {
  kind: "subway" | "bus" | "walk";
  /** 탈 수 있는 것들. 같은 구간을 가는 버스가 여럿이면 다 들어 있다. */
  names: string[];
  color: string | null;
  from: string | null;
  to: string | null;
  fromPos: [number, number] | null;
  toPos: [number, number] | null;
  stops: number | null;
  minutes: number;
};

type TransitOption = {
  durationSec: number;
  transfers: number;
  mode: string;
  fare: number | null;
  firstStation: string | null;
  mapObj: string | null;
  steps: TransitStep[];
};

type Routes = {
  car: { durationSec: number; distanceM: number; path: [number, number][] } | null;
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

const BUS_COLOR = "#2C5FE0";
const ORIGIN_COLOR = "#16233F";
const ALIGHT_COLOR = "#B8360F";

/**
 * 경로에서 "여기서 뭘 해야 한다"는 지점을 뽑는다.
 * 승차 · 환승 · 하차. 어디서 몇 번을 타는지 라벨에 같이 넣는다.
 */
function pointsOf(option: TransitOption, origin: Origin): RoutePoint[] {
  const rides = option.steps.filter((s) => s.kind !== "walk");
  const points: RoutePoint[] = [
    {
      kind: "origin",
      label: "출발",
      sublabel: origin.label,
      color: ORIGIN_COLOR,
      position: [origin.lng, origin.lat],
    },
  ];

  rides.forEach((step, i) => {
    const vehicle = step.names[0] ?? "";
    const color = step.color ?? (step.kind === "bus" ? BUS_COLOR : ORIGIN_COLOR);

    if (step.fromPos) {
      points.push({
        kind: i === 0 ? "board" : "transfer",
        label: `${vehicle} ${i === 0 ? "승차" : "환승"}`.trim(),
        sublabel: step.from,
        color,
        position: step.fromPos,
      });
    }

    // 마지막 구간에서 내리는 곳만 표시한다. 중간에 내리는 곳은
    // 바로 다음 환승 지점과 같은 자리라 두 번 찍힌다.
    if (i === rides.length - 1 && step.toPos) {
      points.push({
        kind: "alight",
        label: "하차",
        sublabel: step.to,
        color: ALIGHT_COLOR,
        position: step.toPos,
      });
    }
  });

  return points;
}

/** 무엇을 타고 어디서 갈아타는지. 펼쳤을 때만 보인다. */
function Steps({ steps }: { steps: TransitStep[] }) {
  return (
    <ol className="mt-3 space-y-2.5 border-t border-dashed border-[var(--tk-line)] pt-3">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-2.5">
          {s.kind === "walk" ? (
            <Footprints className="mt-[3px] size-3.5 shrink-0 text-[var(--tk-faint)]" />
          ) : (
            <span className="mt-[2px] flex max-w-[45%] shrink-0 flex-wrap gap-1">
              {/* 같은 구간을 가는 버스가 여럿이면 다 보여준다. 아무거나 타면 된다. */}
              {s.names.slice(0, 3).map((n) => (
                <span
                  key={n}
                  className="grid h-[18px] place-items-center rounded px-1.5 text-[10.5px]
                    font-bold text-white"
                  style={{ background: s.color ?? (s.kind === "bus" ? "#2C5FE0" : "#5A6784") }}
                >
                  {n}
                </span>
              ))}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="tk-caption block text-[var(--tk-sub)]">
              {s.kind === "walk"
                ? "걷기"
                : `${s.from ?? ""} → ${s.to ?? ""}${s.stops ? ` · ${s.stops}정거장` : ""}`}
            </span>
          </span>
          <span className="tk-caption shrink-0 tabular-nums text-[var(--tk-faint)]">
            {s.minutes}분
          </span>
        </li>
      ))}
    </ol>
  );
}

/** 경로 한 장. 누르면 지도에 그려지고 단계가 펼쳐진다. */
function RouteCard({
  icon,
  title,
  detail,
  time,
  active,
  busy,
  disabled,
  steps,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  time: string;
  active: boolean;
  busy: boolean;
  disabled: boolean;
  steps?: TransitStep[];
  onClick: () => void;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl transition ${
        active ? "bg-[var(--tk-hot-bg)] ring-1 ring-[var(--tk-gold)]" : "bg-[var(--tk-ground)]"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-expanded={active}
        className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-not-allowed"
      >
        <span className="shrink-0 text-[var(--tk-sub)]">
          {busy ? <Loader2 className="size-4 animate-spin" /> : icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="tk-meta block font-bold text-[var(--tk-ink)]">{title}</span>
          <span className="tk-caption mt-0.5 block truncate text-[var(--tk-faint)]">{detail}</span>
        </span>
        <span className="shrink-0 text-[19px] font-extrabold leading-none tracking-tight text-[var(--tk-ink)]">
          {time}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-[var(--tk-faint)] transition-transform ${
            active ? "rotate-180" : ""
          }`}
        />
      </button>

      {active && steps && steps.length > 0 && (
        <div className="px-4 pb-3.5">
          <Steps steps={steps} />
        </div>
      )}
    </div>
  );
}

/**
 * 지하철·버스가 실제로 안 다니는 시간대(대략 새벽 1~5시)인지 대충 잡는다.
 *
 * 정확한 첫차·막차 시각은 노선마다 다르고 우리 API로는 알 수 없다
 * (ODsay가 실시간 도착정보는 줘도 시각표는 안 준다). 그래서 "이 시간엔
 * 보통 안 다닌다"는 사실만 말하지, "몇 시부터 다닌다"처럼 확인 못 한
 * 숫자를 지어내지 않는다.
 */
function isLikelyDeadHour(d: Date): boolean {
  const h = d.getHours();
  return h >= 1 && h < 5;
}

export default function TravelTime({
  destination,
  destinationName,
  onRouteChange,
  promiseId,
  savedRoute,
  onSaved,
  meetingAt,
}: {
  destination: { lat: number; lng: number } | null;
  destinationName: string;
  /** 고른 경로를 위 지도에 그리도록 넘긴다. null이면 지도를 원래대로 돌린다. */
  onRouteChange?: (route: DrawnRoute | null) => void;
  /** 있으면 고른 경로를 서버에 저장한다. 없으면 예전처럼 화면에서만 쓴다. */
  promiseId?: string;
  /** 서버에 저장돼 있던 내 경로. 새로고침해도 이걸로 되살린다. */
  savedRoute?: MemberRoute | null;
  /** 저장이 끝나면 알려준다. 위 "나가야 하는 시각" 블록이 바로 따라 바뀌도록. */
  onSaved?: (route: MemberRoute | null, leaveAt: string | null) => void;
  /** 약속 시각. 심야 시간대면 대중교통 소요시간이 실제와 다를 수 있다고 알려준다.
   *  ODsay는 운행시간을 안 따져서, 새벽 3시에 물어도 낮과 같은 "24분"을 그대로 준다. */
  meetingAt?: Date | null;
}) {
  const [places, setPlaces] = useState<MyPlace[]>([]);
  // 저장된 경로가 있으면 "지금 있는 곳"으로 시작하지 않는다. 그러면 위치 권한을
  // 묻는 사이에 출발지가 바뀌어 저장해둔 경로를 되살릴 수 없다.
  const [selected, setSelected] = useState<string>(savedRoute ? "" : CURRENT);
  const [origin, setOrigin] = useState<Origin | null>(
    savedRoute
      ? {
          label: savedRoute.origin.label,
          lat: savedRoute.origin.lat,
          lng: savedRoute.origin.lng,
        }
      : null
  );
  const [originError, setOriginError] = useState<string | null>(null);
  /** 아직 되살리지 못한 저장 경로. 후보 목록이 오면 그중 하나를 골라 채운다. */
  const pendingRestore = useRef<MemberRoute | null>(savedRoute ?? null);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** 검색으로 고른 곳. 저장 버튼을 띄울지 판단하는 데 쓴다. */
  const [searched, setSearched] = useState<FoundPlace | null>(null);

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
      setSearched(null);
      setOrigin(null);
      useCurrentPosition();
      return;
    }
    const place = places.find((p) => p.id === selected);
    if (place) {
      setSearched(null);
      setOriginError(null);
      setOrigin({ label: place.label, lat: place.lat, lng: place.lng });
    }
  }, [selected, places, useCurrentPosition]);

  const pickSearched = (place: FoundPlace) => {
    setSelected("");
    setSearched(place);
    setOriginError(null);
    setOrigin({ label: place.name, lat: place.lat, lng: place.lng });
  };

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

  // ---------------- 고른 경로를 서버에 남기기 ----------------
  // 화면에만 그리면 새로고침에 사라지고, 무엇보다 다른 참여자가 볼 수 없다.
  // 저장이 실패해도 지도는 이미 그려져 있으므로 길찾기 자체는 막지 않는다.
  const persist = async (route: MemberRoute | null) => {
    if (!promiseId) return;
    try {
      const res = await updateMyMember(promiseId, { route });
      setSaveError(null);
      onSaved?.(route, res.leaveAt ?? null);
    } catch (err) {
      console.error("[travel-time] 경로 저장 실패:", err);
      setSaveError("경로를 저장하지 못했습니다. 다른 참여자에게는 아직 안 보입니다.");
    }
  };

  // ---------------- 경로를 지도에 그리기 ----------------
  /** restoring=true 는 저장된 경로를 되살리는 중이라는 뜻 — 다시 저장하지 않는다. */
  const pick = async (next: Picked, restoring = false) => {
    setDrawError(null);

    // 같은 걸 다시 누르면 접는다 — 눌렀다 뒤로 가는 게 쉬워야 한다.
    if (next === picked || next === null) {
      setPicked(null);
      onRouteChange?.(null);
      if (!restoring) void persist(null);
      return;
    }

    if (next === "car") {
      const car = routes?.car;
      if (!car?.path?.length || !origin) {
        setDrawError("자동차 경로를 그릴 수 없습니다.");
        return;
      }
      setPicked("car");
      onRouteChange?.({
        segments: [{ kind: "car", label: "자동차", color: ORIGIN_COLOR, points: car.path }],
        points: [
          {
            kind: "origin",
            label: "출발",
            sublabel: origin.label,
            color: ORIGIN_COLOR,
            position: [origin.lng, origin.lat],
          },
        ],
      });
      if (!restoring) {
        void persist({
          kind: "car",
          label: "자동차",
          durationSec: car.durationSec,
          origin: { label: origin.label, lat: origin.lat, lng: origin.lng },
        });
      }
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
        setDrawError("노선 정보를 가져오지 못했습니다. 단계는 아래에서 볼 수 있습니다.");
      } else {
        onRouteChange?.({ segments: data.segments, points: pointsOf(option, origin) });
      }
    } catch {
      setDrawError("노선 정보를 가져오지 못했습니다. 단계는 아래에서 볼 수 있습니다.");
    } finally {
      setDrawing(false);
    }

    // 지도에 못 그렸더라도 무엇을 타고 오는지는 정해진 것이므로 저장한다.
    if (!restoring) {
      void persist({
        kind: "transit",
        label: option.mode,
        durationSec: option.durationSec,
        origin: { label: origin.label, lat: origin.lat, lng: origin.lng },
        mapObj: option.mapObj,
        transfers: option.transfers,
        fare: option.fare,
        firstStation: option.firstStation,
      });
    }
  };

  // ---------------- 저장된 경로 되살리기 ----------------
  // 후보 목록이 새로 오면, 저장해둔 것과 같은 경로를 찾아 눌린 상태로 만든다.
  // ODsay 결과는 시간대에 따라 조금씩 달라지므로 mapObj가 같은 것을 먼저 찾고,
  // 없으면 종류와 소요시간(2분 이내)이 맞는 것을 쓴다.
  useEffect(() => {
    const want = pendingRestore.current;
    if (!want || !routes) return;
    pendingRestore.current = null;

    if (want.kind === "car") {
      if (routes.car?.path?.length) void pick("car", true);
      return;
    }

    const list = routes.transit ?? [];
    let idx = want.mapObj ? list.findIndex((t) => t.mapObj === want.mapObj) : -1;
    if (idx === -1) {
      idx = list.findIndex(
        (t) => t.mode === want.label && Math.abs(t.durationSec - want.durationSec) <= 120
      );
    }
    if (idx >= 0) void pick(idx, true);
    // pick은 매 렌더 새로 만들어지지만 여기서는 routes가 바뀔 때만 돌면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes]);

  // ---------------- 저장된 출발지 ----------------
  const saveSearched = () => {
    if (!searched) return;
    const saved = addMyPlace({
      label: searched.name.slice(0, 12),
      address: searched.address,
      lat: searched.lat,
      lng: searched.lng,
    });
    setPlaces(listMyPlaces());
    setSearched(null);
    setSelected(saved.id);
  };

  const deletePlace = (id: string) => {
    removeMyPlace(id);
    setPlaces(listMyPlaces());
    if (selected === id) setSelected(CURRENT);
  };

  // 앱 안에서 못 하는 것(실시간 도착, 상세 안내)은 지도 앱이 훨씬 잘한다.
  const kakaoMapUrl = destination
    ? `https://map.kakao.com/link/to/${encodeURIComponent(destinationName)},${destination.lat},${destination.lng}`
    : `https://map.kakao.com/link/search/${encodeURIComponent(destinationName)}`;

  return (
    <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
      <p className="mb-1 tk-label text-[var(--tk-faint)]">어떻게 갈까</p>
      <p className="tk-caption mb-3 text-[var(--tk-faint)]">
        도착지는 <b className="text-[var(--tk-sub)]">{destinationName}</b>로 정해져 있습니다.
        출발지만 정하세요.
      </p>

      <OriginSearch onPick={pickSearched} />

      {/* 자주 쓰는 출발지 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
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
          <span key={p.id} className="relative">
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
                hover:bg-black/10 ${
                  selected === p.id ? "text-[var(--tk-paper)]" : "text-[var(--tk-faint)]"
                }`}
            >
              <Trash2 className="size-3" />
            </button>
          </span>
        ))}

        {searched && (
          <button
            type="button"
            onClick={saveSearched}
            className="tk-caption flex items-center gap-1 rounded-full border border-dashed
              border-[var(--tk-line)] px-3 py-2 text-[var(--tk-sub)] transition
              hover:bg-[var(--tk-ground)]"
          >
            <Bookmark className="size-3.5" />
            자주 쓰는 곳으로 저장
          </button>
        )}
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
            플랜 장소에 좌표가 없어 계산할 수 없습니다.
          </p>
        ) : routeState === "loading" ? (
          <RouteSkeleton step={1} />
        ) : routeState === "unavailable" || !routes ? (
          <RouteFailed
            destinationName={destinationName}
            kakaoMapUrl={kakaoMapUrl}
            // 출발지를 살짝 흔들어 위 effect를 다시 돌린다.
            onRetry={() => origin && setOrigin({ ...origin })}
            onUseCurrent={() => setSelected(CURRENT)}
          />
        ) : (
          <>
            <p className="tk-caption mb-2 text-[var(--tk-faint)]">
              <b className="text-[var(--tk-sub)]">{origin.label}</b>에서 출발 · 누르면 지도에
              길이 보입니다
            </p>

            {/* 약속이 심야(대략 새벽 1~5시)라면 대중교통 소요시간을 곧이곧대로
                믿으면 안 된다 — 그 시간대엔 실제로 안 다닐 수 있는데, 이 값은
                낮에 물어도 같은 숫자가 나온다(ODsay가 운행시간을 안 따진다).
                "몇 시부터 다닌다"는 확인 못 했으니 지어내지 않고, 사실만 말한다. */}
            {/* 자동차는 됐는데 대중교통만 빈 경우. ODsay가 가끔 일시적으로 빈 응답을
                주기도 하고, 진짜 경로가 없을 수도 있어 어느 쪽인지 우리도 확신할 수
                없다 — 그래서 "없다"고 단정하지 않고 다시 시도할 길을 준다. */}
            {(!routes.transit || routes.transit.length === 0) && (
              <p className="tk-caption mb-2 flex items-start gap-1.5 rounded-xl
                bg-[var(--tk-ground)] px-3.5 py-2.5 text-[var(--tk-sub)]">
                <TrainFront className="mt-[1px] size-3.5 shrink-0 text-[var(--tk-faint)]" />
                <span className="flex-1">
                  지금은 대중교통 경로를 가져오지 못했어요. 실제로 다니는 차가 없을 수도
                  있고, 잠깐 안 될 수도 있어요.
                </span>
                <button
                  type="button"
                  onClick={() => origin && setOrigin({ ...origin })}
                  className="shrink-0 font-bold text-[var(--tk-ink)] underline underline-offset-2"
                >
                  다시 시도
                </button>
              </p>
            )}

            {routes.transit && routes.transit.length > 0 && meetingAt && isLikelyDeadHour(meetingAt) && (
              <p className="tk-caption mb-2 flex items-start gap-1.5 rounded-xl
                bg-[var(--ap-honey-weak)] px-3.5 py-2.5 text-[var(--tk-sub)]">
                <Moon className="mt-[1px] size-3.5 shrink-0" />
                <span>
                  약속이 새벽 시간대예요. 여기 나온 대중교통 소요시간은 실제로 다니는지와
                  상관없이 나온 값이라, 그 시간엔 지하철·버스가 끊겨 있을 수 있어요.
                  자동차나 첫차 시간을 따로 확인해보세요.
                </span>
              </p>
            )}

            <ul className="space-y-1.5">
              {routes.transit?.map((t, i) => (
                <li key={`${t.mode}-${i}`}>
                  <RouteCard
                    icon={<TrainFront className="size-4" />}
                    title={t.mode}
                    detail={
                      (t.transfers > 0 ? `환승 ${t.transfers}회` : "환승 없음") +
                      (t.fare !== null ? ` · ${t.fare.toLocaleString("ko-KR")}원` : "") +
                      (t.firstStation ? ` · ${t.firstStation} 탑승` : "")
                    }
                    time={formatDuration(t.durationSec)}
                    active={picked === i}
                    busy={drawing && picked === i}
                    disabled={false}
                    steps={t.steps}
                    onClick={() => pick(i)}
                  />
                </li>
              ))}

              {routes.car && (
                <li>
                  <RouteCard
                    icon={<Car className="size-4" />}
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
            {saveError && <p className="tk-caption mt-2 text-[var(--tk-warn)]">{saveError}</p>}

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
          카카오맵에서 열기
        </a>
      </Button>
    </section>
  );
}
