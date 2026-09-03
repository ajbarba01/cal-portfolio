export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      authorizations: {
        Row: {
          accepted_at: string;
          accepted_name: string;
          client_id: string;
          id: string;
          kind: string;
          version: string;
        };
        Insert: {
          accepted_at?: string;
          accepted_name: string;
          client_id: string;
          id?: string;
          kind: string;
          version: string;
        };
        Update: {
          accepted_at?: string;
          accepted_name?: string;
          client_id?: string;
          id?: string;
          kind?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "authorizations_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      availability_windows: {
        Row: {
          ends_at: string;
          id: string;
          note: string | null;
          starts_at: string;
        };
        Insert: {
          ends_at: string;
          id?: string;
          note?: string | null;
          starts_at: string;
        };
        Update: {
          ends_at?: string;
          id?: string;
          note?: string | null;
          starts_at?: string;
        };
        Relationships: [];
      };
      booking_pets: {
        Row: {
          booking_id: string;
          pet_id: string;
        };
        Insert: {
          booking_id: string;
          pet_id: string;
        };
        Update: {
          booking_id?: string;
          pet_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booking_pets_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_pets_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_series: {
        Row: {
          active: boolean;
          client_id: string;
          count: number | null;
          created_at: string;
          duration_min: number;
          freq: string;
          id: string;
          open_ended: boolean;
          quote_inputs: Json;
          service_id: string;
          skipped_starts: string[];
          step_interval: number;
          template_starts_at: string;
          until: string | null;
        };
        Insert: {
          active?: boolean;
          client_id: string;
          count?: number | null;
          created_at?: string;
          duration_min: number;
          freq?: string;
          id?: string;
          open_ended?: boolean;
          quote_inputs?: Json;
          service_id: string;
          skipped_starts?: string[];
          step_interval?: number;
          template_starts_at: string;
          until?: string | null;
        };
        Update: {
          active?: boolean;
          client_id?: string;
          count?: number | null;
          created_at?: string;
          duration_min?: number;
          freq?: string;
          id?: string;
          open_ended?: boolean;
          quote_inputs?: Json;
          service_id?: string;
          skipped_starts?: string[];
          step_interval?: number;
          template_starts_at?: string;
          until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "booking_series_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_series_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          client_id: string;
          comments: string | null;
          concurrency: Database["public"]["Enums"]["concurrency_class"];
          created_at: string;
          discount_cents: number;
          distance_miles: number | null;
          ends_at: string;
          final_cents: number;
          id: string;
          kiche_applied: boolean;
          kiche_welcome: boolean;
          payment_status: Database["public"]["Enums"]["payment_status"];
          quote_breakdown: Json;
          quote_inputs: Json;
          reminder_sent_at: string | null;
          requires_approval: boolean;
          series_id: string | null;
          service_id: string;
          starts_at: string;
          status: Database["public"]["Enums"]["booking_status"];
          updated_at: string;
        };
        Insert: {
          client_id: string;
          comments?: string | null;
          concurrency: Database["public"]["Enums"]["concurrency_class"];
          created_at?: string;
          discount_cents?: number;
          distance_miles?: number | null;
          ends_at: string;
          final_cents?: number;
          id?: string;
          kiche_applied?: boolean;
          kiche_welcome?: boolean;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          quote_breakdown?: Json;
          quote_inputs?: Json;
          reminder_sent_at?: string | null;
          requires_approval?: boolean;
          series_id?: string | null;
          service_id: string;
          starts_at: string;
          status?: Database["public"]["Enums"]["booking_status"];
          updated_at?: string;
        };
        Update: {
          client_id?: string;
          comments?: string | null;
          concurrency?: Database["public"]["Enums"]["concurrency_class"];
          created_at?: string;
          discount_cents?: number;
          distance_miles?: number | null;
          ends_at?: string;
          final_cents?: number;
          id?: string;
          kiche_applied?: boolean;
          kiche_welcome?: boolean;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          quote_breakdown?: Json;
          quote_inputs?: Json;
          reminder_sent_at?: string | null;
          requires_approval?: boolean;
          series_id?: string | null;
          service_id?: string;
          starts_at?: string;
          status?: Database["public"]["Enums"]["booking_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_series_id_fkey";
            columns: ["series_id"];
            isOneToOne: false;
            referencedRelation: "booking_series";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      client_debits: {
        Row: {
          amount_cents: number;
          booking_id: string | null;
          client_id: string;
          created_at: string;
          id: string;
          reason: string;
          resolution: string | null;
          settled_at: string | null;
        };
        Insert: {
          amount_cents: number;
          booking_id?: string | null;
          client_id: string;
          created_at?: string;
          id?: string;
          reason: string;
          resolution?: string | null;
          settled_at?: string | null;
        };
        Update: {
          amount_cents?: number;
          booking_id?: string | null;
          client_id?: string;
          created_at?: string;
          id?: string;
          reason?: string;
          resolution?: string | null;
          settled_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "client_debits_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_debits_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      form_responses: {
        Row: {
          booking_id: string | null;
          client_id: string;
          data: Json;
          form_key: string;
          id: string;
          pet_id: string | null;
          submitted_at: string;
        };
        Insert: {
          booking_id?: string | null;
          client_id: string;
          data?: Json;
          form_key: string;
          id?: string;
          pet_id?: string | null;
          submitted_at?: string;
        };
        Update: {
          booking_id?: string | null;
          client_id?: string;
          data?: Json;
          form_key?: string;
          id?: string;
          pet_id?: string | null;
          submitted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "form_responses_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "form_responses_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "form_responses_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
        ];
      };
      inquiries: {
        Row: {
          client_id: string | null;
          created_at: string;
          email: string;
          id: string;
          message: string;
          name: string;
          phone: string | null;
          replied_at: string | null;
          resolved_at: string | null;
          status: string;
          subject: string | null;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          message: string;
          name: string;
          phone?: string | null;
          replied_at?: string | null;
          resolved_at?: string | null;
          status?: string;
          subject?: string | null;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          message?: string;
          name?: string;
          phone?: string | null;
          replied_at?: string | null;
          resolved_at?: string | null;
          status?: string;
          subject?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "inquiries_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      overnight_nights: {
        Row: {
          created_at: string;
          night: string;
          note: string | null;
        };
        Insert: {
          created_at?: string;
          night: string;
          note?: string | null;
        };
        Update: {
          created_at?: string;
          night?: string;
          note?: string | null;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          amount_cents: number;
          booking_id: string;
          client_id: string;
          created_at: string;
          currency: string;
          dispute_status: string | null;
          disputed_at: string | null;
          id: string;
          refunded_cents: number;
          status: Database["public"]["Enums"]["payment_txn_status"];
          stripe_payment_intent_id: string;
        };
        Insert: {
          amount_cents: number;
          booking_id: string;
          client_id: string;
          created_at?: string;
          currency?: string;
          dispute_status?: string | null;
          disputed_at?: string | null;
          id?: string;
          refunded_cents?: number;
          status?: Database["public"]["Enums"]["payment_txn_status"];
          stripe_payment_intent_id: string;
        };
        Update: {
          amount_cents?: number;
          booking_id?: string;
          client_id?: string;
          created_at?: string;
          currency?: string;
          dispute_status?: string | null;
          disputed_at?: string | null;
          id?: string;
          refunded_cents?: number;
          status?: Database["public"]["Enums"]["payment_txn_status"];
          stripe_payment_intent_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      pets: {
        Row: {
          birthdate: string | null;
          breed: string | null;
          client_id: string;
          created_at: string;
          id: string;
          name: string;
          notes: string | null;
          photo_url: string | null;
          species: Database["public"]["Enums"]["pet_species"];
        };
        Insert: {
          birthdate?: string | null;
          breed?: string | null;
          client_id: string;
          created_at?: string;
          id?: string;
          name: string;
          notes?: string | null;
          photo_url?: string | null;
          species?: Database["public"]["Enums"]["pet_species"];
        };
        Update: {
          birthdate?: string | null;
          breed?: string | null;
          client_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          photo_url?: string | null;
          species?: Database["public"]["Enums"]["pet_species"];
        };
        Relationships: [
          {
            foreignKeyName: "dogs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          address: string | null;
          avatar_url: string | null;
          claimed_at: string | null;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          invited_at: string | null;
          kiche_allowed: boolean;
          lat: number | null;
          lng: number | null;
          onboarding_status: Database["public"]["Enums"]["onboarding_status"];
          phone: string | null;
          role: Database["public"]["Enums"]["user_role"];
          unclaimed: boolean;
          zip: string | null;
        };
        Insert: {
          address?: string | null;
          avatar_url?: string | null;
          claimed_at?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          invited_at?: string | null;
          kiche_allowed?: boolean;
          lat?: number | null;
          lng?: number | null;
          onboarding_status?: Database["public"]["Enums"]["onboarding_status"];
          phone?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          unclaimed?: boolean;
          zip?: string | null;
        };
        Update: {
          address?: string | null;
          avatar_url?: string | null;
          claimed_at?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          invited_at?: string | null;
          kiche_allowed?: boolean;
          lat?: number | null;
          lng?: number | null;
          onboarding_status?: Database["public"]["Enums"]["onboarding_status"];
          phone?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          unclaimed?: boolean;
          zip?: string | null;
        };
        Relationships: [];
      };
      reviews: {
        Row: {
          author_name: string;
          body: string;
          client_id: string | null;
          created_at: string;
          external_key: string | null;
          id: string;
          rating: number;
          source: Database["public"]["Enums"]["review_source"];
          status: Database["public"]["Enums"]["review_status"];
        };
        Insert: {
          author_name: string;
          body: string;
          client_id?: string | null;
          created_at?: string;
          external_key?: string | null;
          id?: string;
          rating: number;
          source?: Database["public"]["Enums"]["review_source"];
          status?: Database["public"]["Enums"]["review_status"];
        };
        Update: {
          author_name?: string;
          body?: string;
          client_id?: string | null;
          created_at?: string;
          external_key?: string | null;
          id?: string;
          rating?: number;
          source?: Database["public"]["Enums"]["review_source"];
          status?: Database["public"]["Enums"]["review_status"];
        };
        Relationships: [
          {
            foreignKeyName: "reviews_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          active: boolean;
          concurrency: Database["public"]["Enums"]["concurrency_class"];
          default_duration_min: number | null;
          description: string | null;
          form_key: string | null;
          id: string;
          max_pets: number | null;
          name: string;
          pricing_config: Json;
          pricing_type: Database["public"]["Enums"]["pricing_type"];
          requires_approval: boolean;
          slug: string;
          sort_order: number;
        };
        Insert: {
          active?: boolean;
          concurrency: Database["public"]["Enums"]["concurrency_class"];
          default_duration_min?: number | null;
          description?: string | null;
          form_key?: string | null;
          id?: string;
          max_pets?: number | null;
          name: string;
          pricing_config?: Json;
          pricing_type: Database["public"]["Enums"]["pricing_type"];
          requires_approval?: boolean;
          slug: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          concurrency?: Database["public"]["Enums"]["concurrency_class"];
          default_duration_min?: number | null;
          description?: string | null;
          form_key?: string | null;
          id?: string;
          max_pets?: number | null;
          name?: string;
          pricing_config?: Json;
          pricing_type?: Database["public"]["Enums"]["pricing_type"];
          requires_approval?: boolean;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          auto_approve_threshold_miles: number;
          auto_confirm_horizon_days: number;
          avg_speed_mph: number;
          booking_close_minute: number;
          booking_open_minute: number;
          cancellation_full_refund_hours: number;
          drive_buffer_pct: number;
          gate_use_road_miles: boolean;
          hard_cutoff_miles: number;
          hard_max_advance_days: number;
          holiday_dates: Json;
          holiday_surcharge_cents: number;
          id: string;
          late_cancel_refund_pct: number;
          min_lead_time_hours: number;
          no_show_charge_pct: number;
          origin_label: string;
          origin_lat: number;
          origin_lng: number;
          recurrence_generation_horizon_days: number;
          recurring_discount_pct: number;
          recurring_min_occurrences: number;
          reminder_lead_hours: number;
          road_factor: number;
        };
        Insert: {
          auto_approve_threshold_miles?: number;
          auto_confirm_horizon_days?: number;
          avg_speed_mph?: number;
          booking_close_minute?: number;
          booking_open_minute?: number;
          cancellation_full_refund_hours?: number;
          drive_buffer_pct?: number;
          gate_use_road_miles?: boolean;
          hard_cutoff_miles?: number;
          hard_max_advance_days?: number;
          holiday_dates?: Json;
          holiday_surcharge_cents?: number;
          id?: string;
          late_cancel_refund_pct?: number;
          min_lead_time_hours?: number;
          no_show_charge_pct?: number;
          origin_label?: string;
          origin_lat?: number;
          origin_lng?: number;
          recurrence_generation_horizon_days?: number;
          recurring_discount_pct?: number;
          recurring_min_occurrences?: number;
          reminder_lead_hours?: number;
          road_factor?: number;
        };
        Update: {
          auto_approve_threshold_miles?: number;
          auto_confirm_horizon_days?: number;
          avg_speed_mph?: number;
          booking_close_minute?: number;
          booking_open_minute?: number;
          cancellation_full_refund_hours?: number;
          drive_buffer_pct?: number;
          gate_use_road_miles?: boolean;
          hard_cutoff_miles?: number;
          hard_max_advance_days?: number;
          holiday_dates?: Json;
          holiday_surcharge_cents?: number;
          id?: string;
          late_cancel_refund_pct?: number;
          min_lead_time_hours?: number;
          no_show_charge_pct?: number;
          origin_label?: string;
          origin_lat?: number;
          origin_lng?: number;
          recurrence_generation_horizon_days?: number;
          recurring_discount_pct?: number;
          recurring_min_occurrences?: number;
          reminder_lead_hours?: number;
          road_factor?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: { Args: never; Returns: boolean };
    };
    Enums: {
      booking_status:
        | "pending_approval"
        | "confirmed"
        | "completed"
        | "declined"
        | "cancelled"
        | "no_show";
      concurrency_class: "exclusive" | "resident";
      onboarding_status:
        | "info_pending"
        | "meet_greet_pending"
        | "approved"
        | "declined";
      payment_status: "unpaid" | "paid" | "refunded" | "partially_refunded";
      payment_txn_status:
        | "requires_payment"
        | "succeeded"
        | "refunded"
        | "failed";
      pet_species:
        | "dog"
        | "cat"
        | "bird"
        | "rodent"
        | "reptile"
        | "fish"
        | "other";
      pricing_type:
        | "house_sitting"
        | "check_in"
        | "walk"
        | "training"
        | "meet_greet";
      review_source: "native" | "rover";
      review_status: "pending" | "published" | "rejected";
      user_role: "client" | "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      booking_status: [
        "pending_approval",
        "confirmed",
        "completed",
        "declined",
        "cancelled",
        "no_show",
      ],
      concurrency_class: ["exclusive", "resident"],
      onboarding_status: [
        "info_pending",
        "meet_greet_pending",
        "approved",
        "declined",
      ],
      payment_status: ["unpaid", "paid", "refunded", "partially_refunded"],
      payment_txn_status: [
        "requires_payment",
        "succeeded",
        "refunded",
        "failed",
      ],
      pet_species: ["dog", "cat", "bird", "rodent", "reptile", "fish", "other"],
      pricing_type: [
        "house_sitting",
        "check_in",
        "walk",
        "training",
        "meet_greet",
      ],
      review_source: ["native", "rover"],
      review_status: ["pending", "published", "rejected"],
      user_role: ["client", "admin"],
    },
  },
} as const;
