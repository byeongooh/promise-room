import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Map } from "lucide-react"

export default function MapPlaceholder() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Map className="w-5 h-5" />
          위치 공유
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center h-32 bg-muted rounded-lg border-2 border-dashed border-border">
          <p className="text-muted-foreground text-sm text-center px-4">지도 기능이 여기에 표시될 예정입니다</p>
        </div>
      </CardContent>
    </Card>
  )
}
