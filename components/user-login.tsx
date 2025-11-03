"use client"

import type React from "react"

import { useState } from "react"
import { useUser } from "@/lib/user-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function UserLogin() {
  const [name, setName] = useState("")
  const { setCurrentUser } = useUser()

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      setCurrentUser(name.trim())
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Promise Room</CardTitle>
          <CardDescription>이름을 입력하여 시작하세요</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">이름</Label>
              <Input
                id="name"
                placeholder="이름을 입력하세요"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={!name.trim()}>
              시작하기
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
