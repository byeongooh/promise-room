"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface CreatePromiseFormProps {
  onCreate: (data: {
    title: string
    date: string
    time: string
    location: string
    penalty: string
    creator: string
    password: string
  }) => void
  currentUser: string
}

export default function CreatePromiseForm({ onCreate, currentUser }: CreatePromiseFormProps) {
  const [formData, setFormData] = useState({
    title: "",
    date: "",
    time: "",
    location: "",
    penalty: "",
    password: "",
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validate all fields
    if (
      !formData.title ||
      !formData.date ||
      !formData.time ||
      !formData.location ||
      !formData.penalty ||
      !formData.password
    ) {
      alert("모든 항목을 입력해주세요")
      return
    }

    onCreate({
      ...formData,
      creator: currentUser,
    })
  }

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">새로운 약속 만들기</CardTitle>
        <CardDescription>친구들과 함께할 약속을 생성하세요</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">약속 제목</Label>
            <Input
              id="title"
              placeholder="예: 놀이공원 약속"
              value={formData.title}
              onChange={(e) => handleChange("title", e.target.value)}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">날짜</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => handleChange("date", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="time">시간</Label>
              <Input
                id="time"
                type="time"
                value={formData.time}
                onChange={(e) => handleChange("time", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">장소</Label>
            <Input
              id="location"
              placeholder="예: 롯데월드"
              value={formData.location}
              onChange={(e) => handleChange("location", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="penalty">벌칙</Label>
            <Textarea
              id="penalty"
              placeholder="예: 지각자는 커피 사기"
              value={formData.penalty}
              onChange={(e) => handleChange("penalty", e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              placeholder="약속 비밀번호를 입력하세요"
              value={formData.password}
              onChange={(e) => handleChange("password", e.target.value)}
            />
            <p className="text-sm text-muted-foreground">다른 사람들이 비밀번호를 입력하여 약속에 참여할 수 있습니다</p>
          </div>

          <Button type="submit" className="w-full" size="lg">
            약속 만들기
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
