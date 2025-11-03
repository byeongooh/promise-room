import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Bell } from "lucide-react"

export default function AlarmPlaceholder() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="w-5 h-5" />
          알림 설정
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center h-32 bg-muted rounded-lg border-2 border-dashed border-border">
          <p className="text-muted-foreground text-sm text-center px-4">알람 기능이 여기에 추가될 예정입니다</p>
        </div>
      </CardContent>
    </Card>
  )
}
