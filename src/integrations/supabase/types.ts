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
      api_keys: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          ip_allowlist: string[]
          key_id: string
          label: string
          last_used_at: string | null
          scopes: string[]
          secret: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          ip_allowlist?: string[]
          key_id: string
          label?: string
          last_used_at?: string | null
          scopes?: string[]
          secret: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          ip_allowlist?: string[]
          key_id?: string
          label?: string
          last_used_at?: string | null
          scopes?: string[]
          secret?: string
          user_id?: string
        }
        Relationships: []
      }
      api_rate_buckets: {
        Row: {
          key_id: string
          weight: number
          window_start: string
        }
        Insert: {
          key_id: string
          weight?: number
          window_start: string
        }
        Update: {
          key_id?: string
          weight?: number
          window_start?: string
        }
        Relationships: []
      }
      custody_attestations: {
        Row: {
          id: string
          keys_held: number
          keys_wiped: number
          taken_at: string
        }
        Insert: {
          id?: string
          keys_held?: number
          keys_wiped?: number
          taken_at?: string
        }
        Update: {
          id?: string
          keys_held?: number
          keys_wiped?: number
          taken_at?: string
        }
        Relationships: []
      }
      escrows: {
        Row: {
          confirmations: number
          created_at: string
          expected_amount: number
          funded_amount: number
          funding_txid: string | null
          id: string
          leg: Database["public"]["Enums"]["escrow_leg"]
          multisig_address: string | null
          release_txid: string | null
          status: Database["public"]["Enums"]["escrow_status"]
          trade_id: string
          updated_at: string
        }
        Insert: {
          confirmations?: number
          created_at?: string
          expected_amount: number
          funded_amount?: number
          funding_txid?: string | null
          id?: string
          leg: Database["public"]["Enums"]["escrow_leg"]
          multisig_address?: string | null
          release_txid?: string | null
          status?: Database["public"]["Enums"]["escrow_status"]
          trade_id: string
          updated_at?: string
        }
        Update: {
          confirmations?: number
          created_at?: string
          expected_amount?: number
          funded_amount?: number
          funding_txid?: string | null
          id?: string
          leg?: Database["public"]["Enums"]["escrow_leg"]
          multisig_address?: string | null
          release_txid?: string | null
          status?: Database["public"]["Enums"]["escrow_status"]
          trade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escrows_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount: number
          created_at: string
          filled: number
          id: string
          is_demo: boolean
          pair: string
          price: number
          side: Database["public"]["Enums"]["order_side"]
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          filled?: number
          id?: string
          is_demo?: boolean
          pair?: string
          price: number
          side: Database["public"]["Enums"]["order_side"]
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          filled?: number
          id?: string
          is_demo?: boolean
          pair?: string
          price?: number
          side?: Database["public"]["Enums"]["order_side"]
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          confirm_before_order: boolean
          created_at: string
          default_auth_cap: number | null
          default_auth_hours: number
          default_pair: string | null
          display_name: string
          id: string
          notify_auth_expiring: boolean
          notify_deposit: boolean
          notify_login: boolean
          notify_order_filled: boolean
          notify_settlement: boolean
          notify_settlement_failed: boolean
          notify_weekly_digest: boolean
          reputation: number
          telegram_chat_id: string | null
          telegram_code: string | null
          telegram_code_expires_at: string | null
          telegram_verified: boolean
          timezone: string
          trades_completed: number
          updated_at: string
        }
        Insert: {
          confirm_before_order?: boolean
          created_at?: string
          default_auth_cap?: number | null
          default_auth_hours?: number
          default_pair?: string | null
          display_name?: string
          id: string
          notify_auth_expiring?: boolean
          notify_deposit?: boolean
          notify_login?: boolean
          notify_order_filled?: boolean
          notify_settlement?: boolean
          notify_settlement_failed?: boolean
          notify_weekly_digest?: boolean
          reputation?: number
          telegram_chat_id?: string | null
          telegram_code?: string | null
          telegram_code_expires_at?: string | null
          telegram_verified?: boolean
          timezone?: string
          trades_completed?: number
          updated_at?: string
        }
        Update: {
          confirm_before_order?: boolean
          created_at?: string
          default_auth_cap?: number | null
          default_auth_hours?: number
          default_pair?: string | null
          display_name?: string
          id?: string
          notify_auth_expiring?: boolean
          notify_deposit?: boolean
          notify_login?: boolean
          notify_order_filled?: boolean
          notify_settlement?: boolean
          notify_settlement_failed?: boolean
          notify_weekly_digest?: boolean
          reputation?: number
          telegram_chat_id?: string | null
          telegram_code?: string | null
          telegram_code_expires_at?: string | null
          telegram_verified?: boolean
          timezone?: string
          trades_completed?: number
          updated_at?: string
        }
        Relationships: []
      }
      trade_events: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: Json
          event: string
          id: string
          trade_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event: string
          id?: string
          trade_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event?: string
          id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_events_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          amount: number
          created_at: string
          expires_at: string
          id: string
          is_demo: boolean
          maker_id: string | null
          maker_order_id: string | null
          pair: string
          price: number
          side: Database["public"]["Enums"]["order_side"]
          status: Database["public"]["Enums"]["trade_status"]
          taker_id: string | null
          taker_order_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          expires_at?: string
          id?: string
          is_demo?: boolean
          maker_id?: string | null
          maker_order_id?: string | null
          pair?: string
          price: number
          side: Database["public"]["Enums"]["order_side"]
          status?: Database["public"]["Enums"]["trade_status"]
          taker_id?: string | null
          taker_order_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          expires_at?: string
          id?: string
          is_demo?: boolean
          maker_id?: string | null
          maker_order_id?: string | null
          pair?: string
          price?: number
          side?: Database["public"]["Enums"]["order_side"]
          status?: Database["public"]["Enums"]["trade_status"]
          taker_id?: string | null
          taker_order_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_maker_order_id_fkey"
            columns: ["maker_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_taker_order_id_fkey"
            columns: ["taker_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
          role?: Database["public"]["Enums"]["app_role"]
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
      wallet_auth_challenges: {
        Row: {
          address: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          nonce: string
          statement: string
        }
        Insert: {
          address: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          nonce: string
          statement: string
        }
        Update: {
          address?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          nonce?: string
          statement?: string
        }
        Relationships: []
      }
      wallet_delegations: {
        Row: {
          asset: string
          chain: string
          created_at: string
          expires_at: string
          id: string
          key_ciphertext: string
          label: string | null
          max_amount: number
          revoked_at: string | null
          trading_address: string
          trading_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asset?: string
          chain?: string
          created_at?: string
          expires_at?: string
          id?: string
          key_ciphertext: string
          label?: string | null
          max_amount?: number
          revoked_at?: string | null
          trading_address: string
          trading_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asset?: string
          chain?: string
          created_at?: string
          expires_at?: string
          id?: string
          key_ciphertext?: string
          label?: string | null
          max_amount?: number
          revoked_at?: string | null
          trading_address?: string
          trading_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          backed_up: boolean
          created_at: string
          evm_address: string | null
          id: string
          isk_address: string | null
          kdf_iterations: number
          kdf_salt: string
          ltc_address: string | null
          txc_address: string
          updated_at: string
          user_id: string
          vault_ciphertext: string
        }
        Insert: {
          backed_up?: boolean
          created_at?: string
          evm_address?: string | null
          id?: string
          isk_address?: string | null
          kdf_iterations?: number
          kdf_salt: string
          ltc_address?: string | null
          txc_address: string
          updated_at?: string
          user_id: string
          vault_ciphertext: string
        }
        Update: {
          backed_up?: boolean
          created_at?: string
          evm_address?: string | null
          id?: string
          isk_address?: string | null
          kdf_iterations?: number
          kdf_salt?: string
          ltc_address?: string | null
          txc_address?: string
          updated_at?: string
          user_id?: string
          vault_ciphertext?: string
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          amount: number
          asset: string
          chain: string
          created_at: string
          from_address: string
          id: string
          leg: string
          status: string
          to_address: string
          txid: string
          user_id: string
        }
        Insert: {
          amount: number
          asset: string
          chain: string
          created_at?: string
          from_address: string
          id?: string
          leg: string
          status?: string
          to_address: string
          txid: string
          user_id: string
        }
        Update: {
          amount?: number
          asset?: string
          chain?: string
          created_at?: string
          from_address?: string
          id?: string
          leg?: string
          status?: string
          to_address?: string
          txid?: string
          user_id?: string
        }
        Relationships: []
      }
      wrap_orders: {
        Row: {
          amount_delivered: number | null
          amount_expected: number | null
          amount_received: number | null
          base_symbol: string
          created_at: string
          delivery_txid: string | null
          deposit_address: string | null
          deposit_txid: string | null
          direction: Database["public"]["Enums"]["wrap_direction"]
          error: string | null
          expires_at: string | null
          id: string
          issuer_order_id: string | null
          issuer_status: string | null
          payout_address: string | null
          status: Database["public"]["Enums"]["wrap_status"]
          updated_at: string
          user_id: string
          wrapped_symbol: string
        }
        Insert: {
          amount_delivered?: number | null
          amount_expected?: number | null
          amount_received?: number | null
          base_symbol: string
          created_at?: string
          delivery_txid?: string | null
          deposit_address?: string | null
          deposit_txid?: string | null
          direction: Database["public"]["Enums"]["wrap_direction"]
          error?: string | null
          expires_at?: string | null
          id?: string
          issuer_order_id?: string | null
          issuer_status?: string | null
          payout_address?: string | null
          status?: Database["public"]["Enums"]["wrap_status"]
          updated_at?: string
          user_id: string
          wrapped_symbol: string
        }
        Update: {
          amount_delivered?: number | null
          amount_expected?: number | null
          amount_received?: number | null
          base_symbol?: string
          created_at?: string
          delivery_txid?: string | null
          deposit_address?: string | null
          deposit_txid?: string | null
          direction?: Database["public"]["Enums"]["wrap_direction"]
          error?: string | null
          expires_at?: string | null
          id?: string
          issuer_order_id?: string | null
          issuer_status?: string | null
          payout_address?: string | null
          status?: Database["public"]["Enums"]["wrap_status"]
          updated_at?: string
          user_id?: string
          wrapped_symbol?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      api_bump_rate: {
        Args: { _key: string; _weight: number; _window: string }
        Returns: number
      }
      custody_snapshot: {
        Args: never
        Returns: {
          keys_held: number
          last_sweep: string
          last_wiped: number
          next_expiry: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_trade_participant: {
        Args: { _trade_id: string; _user_id: string }
        Returns: boolean
      }
      purge_expired_delegations: { Args: never; Returns: number }
      purge_expired_wallet_challenges: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "user" | "arbitrator" | "admin"
      escrow_leg:
        | "txc"
        | "usdc"
        | "tsd"
        | "usdt"
        | "ltc"
        | "isk"
        | "zcu"
        | "wbtc"
        | "wltc"
        | "weth"
      escrow_status:
        | "awaiting_funding"
        | "funding_seen"
        | "confirmed"
        | "released"
        | "refunded"
      order_side: "buy" | "sell"
      order_status: "open" | "partial" | "filled" | "cancelled"
      trade_status:
        | "matched"
        | "maker_funded"
        | "taker_funded"
        | "both_funded"
        | "released"
        | "settled"
        | "disputed"
        | "arbitrated"
        | "timed_out"
        | "refunded"
      wrap_direction: "wrap" | "unwrap"
      wrap_status:
        | "created"
        | "awaiting_deposit"
        | "deposit_detected"
        | "deposit_confirmed"
        | "processing"
        | "complete"
        | "failed"
        | "expired"
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
      app_role: ["user", "arbitrator", "admin"],
      escrow_leg: [
        "txc",
        "usdc",
        "tsd",
        "usdt",
        "ltc",
        "isk",
        "zcu",
        "wbtc",
        "wltc",
        "weth",
      ],
      escrow_status: [
        "awaiting_funding",
        "funding_seen",
        "confirmed",
        "released",
        "refunded",
      ],
      order_side: ["buy", "sell"],
      order_status: ["open", "partial", "filled", "cancelled"],
      trade_status: [
        "matched",
        "maker_funded",
        "taker_funded",
        "both_funded",
        "released",
        "settled",
        "disputed",
        "arbitrated",
        "timed_out",
        "refunded",
      ],
      wrap_direction: ["wrap", "unwrap"],
      wrap_status: [
        "created",
        "awaiting_deposit",
        "deposit_detected",
        "deposit_confirmed",
        "processing",
        "complete",
        "failed",
        "expired",
      ],
    },
  },
} as const
