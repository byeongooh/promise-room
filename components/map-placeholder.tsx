"use client"

import { useEffect, useId } from "react"

declare global {
  interface Window {
    kakao: any
  }
}

export default function MapPlaceholder({ location }: { location: string }) {
  const mapId = useId()

  useEffect(() => {
    if (!location) return

    const kakao = window.kakao
    if (!kakao?.maps) {
      console.warn("Kakao SDK not loaded. Check app/layout.tsx Script.")
      return
    }

    kakao.maps.load(() => {
      const container = document.getElementById(mapId)
      if (!container) return

      // 기존 내용 비우기(리렌더/이동 시 중복 방지)
      container.innerHTML = ""

      const map = new kakao.maps.Map(container, {
        center: new kakao.maps.LatLng(37.5665, 126.978),
        level: 3,
      })

      // ✅ 장소명(역/카페 등) 대응: 키워드 검색
      const places = new kakao.maps.services.Places()

      places.keywordSearch(location, (result: any, status: any) => {
        if (status !== kakao.maps.services.Status.OK || !result?.length) {
          console.warn("장소 검색 실패:", location)
          return
        }

        const first = result[0]
        const pos = new kakao.maps.LatLng(first.y, first.x)

        const marker = new kakao.maps.Marker({ map, position: pos })

        const infowindow = new kakao.maps.InfoWindow({
          content: `<div style="padding:6px 8px;font-size:12px;">${location}</div>`,
        })
        infowindow.open(map, marker)

        map.setCenter(pos)
      })
    })
  }, [location, mapId])

  return (
    <div className="rounded-xl border bg-card">
      <div className="p-6">
        <div className="mb-1 font-semibold">위치 공유</div>
        <div className="text-sm text-muted-foreground mb-4">약속 장소 지도</div>

        <div
          id={mapId}
          className="w-full h-[240px] rounded-md border bg-muted"
        />

        <p className="text-xs text-muted-foreground mt-2">장소: {location}</p>
      </div>
    </div>
  )
}
