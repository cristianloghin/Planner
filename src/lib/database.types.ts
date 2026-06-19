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
          role: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          role?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          role?: string
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
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      checklist_item: {
        Row: {
          group_label: string | null
          id: string
          label: string
          occurrence_start: string | null
          owner_series_id: string
          required: boolean
          sort_order: number
        }
        Insert: {
          group_label?: string | null
          id?: string
          label: string
          occurrence_start?: string | null
          owner_series_id: string
          required?: boolean
          sort_order?: number
        }
        Update: {
          group_label?: string | null
          id?: string
          label?: string
          occurrence_start?: string | null
          owner_series_id?: string
          required?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklist_item_owner_series_id_fkey"
            columns: ["owner_series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      event_occurrence: {
        Row: {
          cancelled: boolean
          occurrence_start: string
          rescheduled_to: string | null
          series_id: string
          status: string | null
        }
        Insert: {
          cancelled?: boolean
          occurrence_start: string
          rescheduled_to?: string | null
          series_id: string
          status?: string | null
        }
        Update: {
          cancelled?: boolean
          occurrence_start?: string
          rescheduled_to?: string | null
          series_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_occurrence_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_occurrence_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "occurrence_status"
            referencedColumns: ["code"]
          },
        ]
      }
      event_participant: {
        Row: {
          invited_by: string | null
          role: string
          rsvp: string
          series_id: string
          user_id: string
        }
        Insert: {
          invited_by?: string | null
          role: string
          rsvp?: string
          series_id: string
          user_id: string
        }
        Update: {
          invited_by?: string | null
          role?: string
          rsvp?: string
          series_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_participant_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participant_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "participant_role"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "event_participant_rsvp_fkey"
            columns: ["rsvp"]
            isOneToOne: false
            referencedRelation: "rsvp_status"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "event_participant_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participant_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
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
          created_at: string
          created_by: string | null
          default_status: string | null
          dtstart: string | null
          duration: string
          id: string
          is_template: boolean
          rrule: string | null
          split_from_id: string | null
          template_id: string | null
          timezone: string
          title: string
          updated_at: string
        }
        Insert: {
          account_id: string
          all_day?: boolean
          created_at?: string
          created_by?: string | null
          default_status?: string | null
          dtstart?: string | null
          duration?: string
          id?: string
          is_template?: boolean
          rrule?: string | null
          split_from_id?: string | null
          template_id?: string | null
          timezone?: string
          title?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          all_day?: boolean
          created_at?: string
          created_by?: string | null
          default_status?: string | null
          dtstart?: string | null
          duration?: string
          id?: string
          is_template?: boolean
          rrule?: string | null
          split_from_id?: string | null
          template_id?: string | null
          timezone?: string
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
          {
            foreignKeyName: "event_series_default_status_fkey"
            columns: ["default_status"]
            isOneToOne: false
            referencedRelation: "occurrence_status"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "event_series_split_from_id_fkey"
            columns: ["split_from_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_series_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      item_status: {
        Row: {
          code: string
        }
        Insert: {
          code: string
        }
        Update: {
          code?: string
        }
        Relationships: []
      }
      note: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          metadata: Json
          owner_series_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          metadata?: Json
          owner_series_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          metadata?: Json
          owner_series_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_owner_series_id_fkey"
            columns: ["owner_series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          dismissed_at: string | null
          occurrence_start: string
          reminder_id: string
          sent_at: string
          series_id: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string | null
          occurrence_start: string
          reminder_id: string
          sent_at?: string
          series_id: string
          user_id: string
        }
        Update: {
          dismissed_at?: string | null
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
      occurrence_dependency: {
        Row: {
          created_at: string
          dependent_occurrence: string
          dependent_series: string
          prerequisite_occurrence: string
          prerequisite_series: string
          required_status: string
        }
        Insert: {
          created_at?: string
          dependent_occurrence: string
          dependent_series: string
          prerequisite_occurrence: string
          prerequisite_series: string
          required_status?: string
        }
        Update: {
          created_at?: string
          dependent_occurrence?: string
          dependent_series?: string
          prerequisite_occurrence?: string
          prerequisite_series?: string
          required_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "occurrence_dependency_dependent_series_fkey"
            columns: ["dependent_series"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrence_dependency_prerequisite_series_fkey"
            columns: ["prerequisite_series"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrence_dependency_required_status_fkey"
            columns: ["required_status"]
            isOneToOne: false
            referencedRelation: "occurrence_status"
            referencedColumns: ["code"]
          },
        ]
      }
      occurrence_item_removed: {
        Row: {
          item_id: string
          occurrence_start: string
          series_id: string
        }
        Insert: {
          item_id: string
          occurrence_start: string
          series_id: string
        }
        Update: {
          item_id?: string
          occurrence_start?: string
          series_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "occurrence_item_removed_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrence_item_removed_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      occurrence_item_state: {
        Row: {
          completed_at: string
          item_id: string
          occurrence_start: string
          series_id: string
          status: string
        }
        Insert: {
          completed_at?: string
          item_id: string
          occurrence_start: string
          series_id: string
          status: string
        }
        Update: {
          completed_at?: string
          item_id?: string
          occurrence_start?: string
          series_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "occurrence_item_state_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrence_item_state_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrence_item_state_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "item_status"
            referencedColumns: ["code"]
          },
        ]
      }
      occurrence_participant_override: {
        Row: {
          occurrence_start: string
          removed: boolean
          rsvp: string | null
          series_id: string
          user_id: string
        }
        Insert: {
          occurrence_start: string
          removed?: boolean
          rsvp?: string | null
          series_id: string
          user_id: string
        }
        Update: {
          occurrence_start?: string
          removed?: boolean
          rsvp?: string | null
          series_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "occurrence_participant_override_rsvp_fkey"
            columns: ["rsvp"]
            isOneToOne: false
            referencedRelation: "rsvp_status"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "occurrence_participant_override_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrence_participant_override_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      occurrence_status: {
        Row: {
          code: string
        }
        Insert: {
          code: string
        }
        Update: {
          code?: string
        }
        Relationships: []
      }
      participant_role: {
        Row: {
          code: string
        }
        Insert: {
          code: string
        }
        Update: {
          code?: string
        }
        Relationships: []
      }
      participation_requirement: {
        Row: {
          id: string
          min_count: number
          role: string
          series_id: string
        }
        Insert: {
          id?: string
          min_count?: number
          role: string
          series_id: string
        }
        Update: {
          id?: string
          min_count?: number
          role?: string
          series_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participation_requirement_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "participant_role"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "participation_requirement_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      person: {
        Row: {
          account_id: string
          color: string
          created_at: string
          id: string
          kind: string
          name: string
          sort_order: number
          user_id: string | null
        }
        Insert: {
          account_id: string
          color?: string
          created_at?: string
          id?: string
          kind?: string
          name: string
          sort_order?: number
          user_id?: string | null
        }
        Update: {
          account_id?: string
          color?: string
          created_at?: string
          id?: string
          kind?: string
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
      reminder: {
        Row: {
          id: string
          method: string
          offset_seconds: number
          series_id: string
          user_id: string
        }
        Insert: {
          id?: string
          method?: string
          offset_seconds: number
          series_id: string
          user_id: string
        }
        Update: {
          id?: string
          method?: string
          offset_seconds?: number
          series_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_method_fkey"
            columns: ["method"]
            isOneToOne: false
            referencedRelation: "reminder_method"
            referencedColumns: ["code"]
          },
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
      reminder_method: {
        Row: {
          code: string
        }
        Insert: {
          code: string
        }
        Update: {
          code?: string
        }
        Relationships: []
      }
      rsvp_status: {
        Row: {
          code: string
        }
        Insert: {
          code: string
        }
        Update: {
          code?: string
        }
        Relationships: []
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
      split_series: {
        Args: { p_cutover: string; p_series: string; p_truncated_rrule: string }
        Returns: string
      }
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
