export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      account_member: {
        Row: {
          account_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_member_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_member_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      app_user: {
        Row: {
          created_at: string
          id: string
        }
        Insert: {
          created_at?: string
          id: string
        }
        Update: {
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      event_occurrence: {
        Row: {
          cancelled: boolean
          metadata: Json
          occurrence_start: string
          rescheduled_duration: string | null
          rescheduled_to: string | null
          series_id: string
        }
        Insert: {
          cancelled?: boolean
          metadata?: Json
          occurrence_start: string
          rescheduled_duration?: string | null
          rescheduled_to?: string | null
          series_id: string
        }
        Update: {
          cancelled?: boolean
          metadata?: Json
          occurrence_start?: string
          rescheduled_duration?: string | null
          rescheduled_to?: string | null
          series_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_occurrence_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      event_person: {
        Row: {
          person_id: string
          series_id: string
        }
        Insert: {
          person_id: string
          series_id: string
        }
        Update: {
          person_id?: string
          series_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_person_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_person_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      event_series: {
        Row: {
          account_id: string
          all_day: boolean
          color_key: string | null
          created_at: string
          created_by: string | null
          dtstart: string | null
          duration: string
          id: string
          is_template: boolean
          metadata: Json
          rrule: string | null
          title: string
          updated_at: string
        }
        Insert: {
          account_id: string
          all_day?: boolean
          color_key?: string | null
          created_at?: string
          created_by?: string | null
          dtstart?: string | null
          duration?: string
          id?: string
          is_template?: boolean
          metadata?: Json
          rrule?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          all_day?: boolean
          color_key?: string | null
          created_at?: string
          created_by?: string | null
          dtstart?: string | null
          duration?: string
          id?: string
          is_template?: boolean
          metadata?: Json
          rrule?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_series_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          occurrence_start: string
          reminder_id: string
          sent_at: string
          series_id: string
          user_id: string
        }
        Insert: {
          occurrence_start: string
          reminder_id: string
          sent_at?: string
          series_id: string
          user_id: string
        }
        Update: {
          occurrence_start?: string
          reminder_id?: string
          sent_at?: string
          series_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "reminder"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      person: {
        Row: {
          account_id: string
          color_key: string
          created_at: string
          id: string
          name: string
          sort_order: number
          user_id: string | null
        }
        Insert: {
          account_id: string
          color_key?: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          user_id?: string | null
        }
        Update: {
          account_id?: string
          color_key?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscription: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscription_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder: {
        Row: {
          id: string
          offset_seconds: number
          series_id: string
          user_id: string
        }
        Insert: {
          id?: string
          offset_seconds: number
          series_id: string
          user_id: string
        }
        Update: {
          id?: string
          offset_seconds?: number
          series_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preference: {
        Row: {
          account_id: string
          prefs: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          prefs?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          prefs?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preference_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_series: { Args: { p_series: string }; Returns: boolean }
      create_account: { Args: { p_name: string }; Returns: string }
      is_account_member: { Args: { p_account: string }; Returns: boolean }
      schedule_reminder_sender: {
        Args: {
          p_cron_secret: string
          p_function_url: string
          p_schedule?: string
        }
        Returns: undefined
      }
      search_events: {
        Args: { p_account: string; p_query: string }
        Returns: {
          all_day: boolean
          dtstart: string
          rank: number
          rrule: string
          series_id: string
          title: string
        }[]
      }
      unschedule_reminder_sender: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

