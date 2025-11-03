import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface ParticipantListProps {
  participants: string[]
}

export default function ParticipantList({ participants }: ParticipantListProps) {
  const getInitial = (name: string) => {
    return name.charAt(0).toUpperCase()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          참여자 목록
        </CardTitle>
        <CardDescription>총 {participants.length}명이 참여 중입니다</CardDescription>
      </CardHeader>
      <CardContent>
        {participants.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">아직 참여자가 없습니다</p>
        ) : (
          <ul className="space-y-3">
            {participants.map((participant, index) => (
              <li key={index} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {getInitial(participant)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-medium">{participant}</p>
                  {index === 0 && <p className="text-xs text-muted-foreground">약속 생성자</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
