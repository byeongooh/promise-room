"use client"

import { useMemo } from "react"
import type { Promise } from "@/app/page"
import PromiseCard from "@/components/promise-card"
import { Card, CardContent } from "@/components/ui/card"
import { Calendar } from "lucide-react"

interface PromiseDashboardProps {
  promises: Promise[]
  currentUser: string
}

export default function PromiseDashboard({ promises, currentUser }: PromiseDashboardProps) {
  // Categorize promises into upcoming and past
  const { upcomingPromises, pastPromises } = useMemo(() => {
    const now = new Date()
    const upcoming: Promise[] = []
    const past: Promise[] = []

    promises.forEach((promise) => {
      const promiseDate = new Date(`${promise.date} ${promise.time}`)
      if (promiseDate >= now) {
        upcoming.push(promise)
      } else {
        past.push(promise)
      }
    })

    return { upcomingPromises: upcoming, pastPromises: past }
  }, [promises])

  if (promises.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Calendar className="w-16 h-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">아직 약속이 없습니다</h3>
          <p className="text-muted-foreground text-center">새 약속 만들기 버튼을 눌러 첫 약속을 만들어보세요</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      {/* Upcoming Promises Section */}
      {upcomingPromises.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-2xl font-bold">다가오는 약속</h2>
            <span className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium">
              {upcomingPromises.length}
            </span>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingPromises.map((promise) => (
              <PromiseCard key={promise.id} promise={promise} currentUser={currentUser} />
            ))}
          </div>
        </div>
      )}

      {/* Past Promises Section */}
      {pastPromises.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-2xl font-bold text-muted-foreground">지난 약속</h2>
            <span className="bg-muted text-muted-foreground px-3 py-1 rounded-full text-sm font-medium">
              {pastPromises.length}
            </span>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pastPromises.map((promise) => (
              <PromiseCard key={promise.id} promise={promise} currentUser={currentUser} isPast />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
