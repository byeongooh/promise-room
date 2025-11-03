import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Clock, MapPin, AlertCircle, Map, Bell } from "lucide-react"
import MapPlaceholder from "./map-placeholder"
import AlarmPlaceholder from "./alarm-placeholder"

interface PromiseDetailProps {
  promise: {
    title: string
    date: string
    time: string
    location: string
    penalty: string
  }
}

export default function PromiseDetail({ promise }: PromiseDetailProps) {
  // Format date to Korean format
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-balance">{promise.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <Calendar className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
              <div>
                <p className="font-medium">날짜</p>
                <p className="text-muted-foreground">{formatDate(promise.date)}</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary flex-shrink-0" />
                <Bell className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </div>
              <div className="flex-1">
                <p className="font-medium">시간</p>
                <p className="text-muted-foreground">{promise.time}</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary flex-shrink-0" />
                <Map className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </div>
              <div className="flex-1">
                <p className="font-medium">장소</p>
                <p className="text-muted-foreground">{promise.location}</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <AlertCircle className="w-5 h-5 text-destructive mt-1 flex-shrink-0" />
              <div>
                <p className="font-medium">벌칙</p>
                <p className="text-muted-foreground">{promise.penalty}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <MapPlaceholder />
        <AlarmPlaceholder />
      </div>
    </div>
  )
}
