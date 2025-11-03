"use client"

import { useRouter } from "next/navigation"
import type { Promise } from "@/app/page"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, MapPin, Users, Lock } from "lucide-react"
import { cn } from "@/lib/utils"

interface PromiseCardProps {
  promise: Promise
  currentUser: string
  isPast?: boolean
}

export default function PromiseCard({ promise, currentUser, isPast = false }: PromiseCardProps) {
  const router = useRouter()

  const isCreator = promise.creator === currentUser
  const isParticipant = promise.participants.includes(currentUser)
  const hasAccess = isCreator || isParticipant

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    })
  }

  const formatTime = (timeString: string) => {
    return timeString
  }

  return (
    <Card
      className={cn("cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]", isPast && "opacity-60")}
      onClick={() => router.push(`/promise/${promise.id}`)}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-xl text-balance">{promise.title}</CardTitle>
          <div className="flex gap-2 shrink-0">
            {!hasAccess && (
              <Badge variant="secondary" className="gap-1">
                <Lock className="w-3 h-3" />
                잠김
              </Badge>
            )}
            {isPast && <Badge variant="secondary">완료</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span>{formatDate(promise.date)}</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span>{formatTime(promise.time)}</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <MapPin className="w-4 h-4 text-muted-foreground" />
          <span className="truncate">{promise.location}</span>
        </div>

        <div className="flex items-center gap-2 text-sm pt-2 border-t">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">참여자 {promise.participants.length}명</span>
        </div>
      </CardContent>
    </Card>
  )
}
