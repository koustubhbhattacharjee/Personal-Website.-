// lib/auth.js — single source of truth for authOptions
// Import from here instead of pages/api/auth/[...nextauth] to avoid
// Next.js static analysis choking on bracket filenames.

import GoogleProvider from "next-auth/providers/google"
import { getStudentByEmail } from "./db"

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/calendar.readonly",
          access_type: "offline",
          prompt: "consent",
        }
      }
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      console.log("SIGNIN ATTEMPT:", user.email)
      if ((user.email || "").toLowerCase() === "kbohuastt@gmail.com") return true
      const student = await getStudentByEmail(user.email)
      console.log("STUDENT FOUND:", JSON.stringify(student))
      return !!student
    },
    async jwt({ token, account, user }) {
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
      }
      if (user) {
        if ((user.email || "").toLowerCase() === "kbohuastt@gmail.com") {
          token.isAdmin = true
          return token
        }
        const student = await getStudentByEmail(user.email)
        token.notionStudentId = student?.id
        token.studentName = student?.name
      }
      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken
      session.notionStudentId = token.notionStudentId
      session.isAdmin = token.isAdmin || false
      session.user.studentName = token.studentName
      return session
    }
  },
  pages: {
    signIn: "/",
    error: "/",
  }
}
