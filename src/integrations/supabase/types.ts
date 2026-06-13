export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      characters: {
        Row: {
          bounty: number | null
          created_at: string
          crew: string | null
          current_price: number
          description: string | null
          id: string
          image_url: string | null
          name: string
          previous_price: number
          role: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          bounty?: number | null
          created_at?: string
          crew?: string | null
          current_price?: number
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          previous_price?: number
          role?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          bounty?: number | null
          created_at?: string
          crew?: string | null
          current_price?: number
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          previous_price?: number
          role?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      market_event_impacts: {
        Row: {
          character_id: string
          created_at: string
          event_id: string
          id: string
          pct_change: number
          price_after: number | null
          price_before: number | null
        }
        Insert: {
          character_id: string
          created_at?: string
          event_id: string
          id?: string
          pct_change: number
          price_after?: number | null
          price_before?: number | null
        }
        Update: {
          character_id?: string
          created_at?: string
          event_id?: string
          id?: string
          pct_change?: number
          price_after?: number | null
          price_before?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_event_impacts_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_event_impacts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "market_events"
            referencedColumns: ["id"]
          },
        ]
      }
      market_events: {
        Row: {
          created_at: string
          created_by: string | null
          default_pct_change: number
          description: string
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          published_at: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_pct_change?: number
          description?: string
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          published_at?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_pct_change?: number
          description?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          published_at?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      news: {
        Row: {
          body: string
          character_id: string | null
          created_at: string
          id: string
          impact: string
          title: string
        }
        Insert: {
          body: string
          character_id?: string | null
          created_at?: string
          id?: string
          impact?: string
          title: string
        }
        Update: {
          body?: string
          character_id?: string | null
          created_at?: string
          id?: string
          impact?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          character_id: string
          created_at: string
          id: string
          note: string | null
          pct_change: number | null
          price: number
          source_event_id: string | null
        }
        Insert: {
          character_id: string
          created_at?: string
          id?: string
          note?: string | null
          pct_change?: number | null
          price: number
          source_event_id?: string | null
        }
        Update: {
          character_id?: string
          created_at?: string
          id?: string
          note?: string | null
          pct_change?: number | null
          price?: number
          source_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_history_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "market_events"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          balance_after: number
          character_id: string
          created_at: string
          id: string
          price: number
          shares: number
          side: string
          total: number
          user_id: string
        }
        Insert: {
          balance_after: number
          character_id: string
          created_at?: string
          id?: string
          price: number
          shares: number
          side: string
          total: number
          user_id: string
        }
        Update: {
          balance_after?: number
          character_id?: string
          created_at?: string
          id?: string
          price?: number
          shares?: number
          side?: string
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      trivia_attempts: {
        Row: {
          correct: boolean
          created_at: string
          id: string
          question_id: string
          reward: number
          user_id: string
        }
        Insert: {
          correct: boolean
          created_at?: string
          id?: string
          question_id: string
          reward?: number
          user_id: string
        }
        Update: {
          correct?: boolean
          created_at?: string
          id?: string
          question_id?: string
          reward?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trivia_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "trivia_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      trivia_questions: {
        Row: {
          answer_index: number
          choices: Json
          created_at: string
          difficulty: string
          id: string
          question: string
          reward: number
        }
        Insert: {
          answer_index: number
          choices: Json
          created_at?: string
          difficulty?: string
          id?: string
          question: string
          reward?: number
        }
        Update: {
          answer_index?: number
          choices?: Json
          created_at?: string
          difficulty?: string
          id?: string
          question?: string
          reward?: number
        }
        Relationships: []
      }
      user_holdings: {
        Row: {
          avg_cost: number
          character_id: string
          created_at: string
          id: string
          shares: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_cost?: number
          character_id: string
          created_at?: string
          id?: string
          shares?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_cost?: number
          character_id?: string
          created_at?: string
          id?: string
          shares?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_holdings_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_wallets: {
        Row: {
          berries: number
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          berries?: number
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          berries?: number
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_market_event: {
        Args: { _event_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          default_pct_change: number
          description: string
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          published_at: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "market_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      execute_trade: {
        Args: {
          _shares: number
          _side: string
          _slug: string
          _user_id: string
        }
        Returns: {
          balance_after: number
          character_id: string
          created_at: string
          id: string
          price: number
          shares: number
          side: string
          total: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      preview_market_event: {
        Args: { _event_id: string }
        Returns: {
          character_id: string
          name: string
          pct_change: number
          price_after: number
          price_before: number
          slug: string
        }[]
      }
      publish_due_events: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      event_status: "draft" | "scheduled" | "published"
      event_type:
        | "story_event"
        | "battle_result"
        | "character_reveal"
        | "power_up"
        | "political_event"
        | "community_event"
        | "market_correction"
        | "meme_event"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      event_status: ["draft", "scheduled", "published"],
      event_type: [
        "story_event",
        "battle_result",
        "character_reveal",
        "power_up",
        "political_event",
        "community_event",
        "market_correction",
        "meme_event",
      ],
    },
  },
} as const
