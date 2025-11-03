"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { UserPlus } from "lucide-react"
import { useUser } from "@/lib/user-context"

interface JoinFormProps {
  onJoin: (name: string) => void
  isParticipant: boolean
}

export default function JoinForm({ onJoin, isParticipant }: JoinFormProps) {
  const { currentUser } = useUser()

  const handleJoin = () => {
    if (!currentUser) {
      alert("로그인이 필요합니다")
      return
    }

    onJoin(currentUser)
  }

  if (isParticipant) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            약속 참여 완료
          </CardTitle>
          <CardDescription>이미 이 약속에 참여하셨습니다</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="w-5 h-5" />
          약속 참여하기
        </CardTitle>
        <CardDescription>{currentUser}님으로 약속에 참여하세요</CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={handleJoin} className="w-full">
          참여하기
        </Button>
      </CardContent>
    </Card>
  )
}
