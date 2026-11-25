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
      account_email_codes: {
        Row: {
          code_hash: string
          created_at: string
          email: string
          expires_at: string
          id: string
          tries: number
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          tries?: number
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          tries?: number
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ad_daily_stats: {
        Row: {
          ad_id: string
          clicks: number
          day: string
          views: number
        }
        Insert: {
          ad_id: string
          clicks?: number
          day: string
          views?: number
        }
        Update: {
          ad_id?: string
          clicks?: number
          day?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "ad_daily_stats_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ad_placements"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_placements: {
        Row: {
          accent: string
          advertiser: string
          advertiser_kind: string
          body: string
          coin_slug: string | null
          created_at: string
          created_by: string
          cta_label: string
          ends_at: string | null
          id: string
          image_path: string | null
          link: string
          note: string | null
          paused: boolean
          spot: string
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          accent?: string
          advertiser: string
          advertiser_kind: string
          body?: string
          coin_slug?: string | null
          created_at?: string
          created_by: string
          cta_label: string
          ends_at?: string | null
          id?: string
          image_path?: string | null
          link: string
          note?: string | null
          paused?: boolean
          spot: string
          starts_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          accent?: string
          advertiser?: string
          advertiser_kind?: string
          body?: string
          coin_slug?: string | null
          created_at?: string
          created_by?: string
          cta_label?: string
          ends_at?: string | null
          id?: string
          image_path?: string | null
          link?: string
          note?: string | null
          paused?: boolean
          spot?: string
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_role_events: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          target_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          target_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          target_id?: string
        }
        Relationships: []
      }
      ai_coins: {
        Row: {
          active: boolean
          binance_ok: boolean | null
          binance_symbol: string | null
          id: string
          image: string | null
          market_cap: number | null
          name: string
          rank: number | null
          swap_coin: string | null
          symbol: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          binance_ok?: boolean | null
          binance_symbol?: string | null
          id: string
          image?: string | null
          market_cap?: number | null
          name: string
          rank?: number | null
          swap_coin?: string | null
          symbol: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          binance_ok?: boolean | null
          binance_symbol?: string | null
          id?: string
          image?: string | null
          market_cap?: number | null
          name?: string
          rank?: number | null
          swap_coin?: string | null
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_daily_prices: {
        Row: {
          close: number
          coin_id: string
          day: string
          high: number | null
          low: number | null
          open: number | null
          source: string
          volume: number | null
        }
        Insert: {
          close: number
          coin_id: string
          day: string
          high?: number | null
          low?: number | null
          open?: number | null
          source: string
          volume?: number | null
        }
        Update: {
          close?: number
          coin_id?: string
          day?: string
          high?: number | null
          low?: number | null
          open?: number | null
          source?: string
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_daily_prices_coin_id_fkey"
            columns: ["coin_id"]
            isOneToOne: false
            referencedRelation: "ai_coins"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_plan_checks: {
        Row: {
          created_at: string
          day: string
          exec_decided_at: string | null
          exec_decided_via: string | null
          exec_expires_at: string | null
          exec_status: string
          exec_telegram_chat_id: string | null
          exec_telegram_message_id: number | null
          exec_total_usd: number | null
          id: string
          message: string
          plan_id: string
          sent_at: string | null
          suggestion: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          day: string
          exec_decided_at?: string | null
          exec_decided_via?: string | null
          exec_expires_at?: string | null
          exec_status?: string
          exec_telegram_chat_id?: string | null
          exec_telegram_message_id?: number | null
          exec_total_usd?: number | null
          id?: string
          message: string
          plan_id: string
          sent_at?: string | null
          suggestion: Json
          user_id: string
        }
        Update: {
          created_at?: string
          day?: string
          exec_decided_at?: string | null
          exec_decided_via?: string | null
          exec_expires_at?: string | null
          exec_status?: string
          exec_telegram_chat_id?: string | null
          exec_telegram_message_id?: number | null
          exec_total_usd?: number | null
          id?: string
          message?: string
          plan_id?: string
          sent_at?: string | null
          suggestion?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_plan_checks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "ai_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_plan_moves: {
        Row: {
          amount: number
          amount_in: number | null
          amount_out: number | null
          check_id: string
          coin_id: string
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          plan_id: string
          route_id: string | null
          seq: number
          side: string
          started_at: string | null
          status: string
          swap_coin: string
          updated_at: string
          usd: number
          user_id: string
        }
        Insert: {
          amount: number
          amount_in?: number | null
          amount_out?: number | null
          check_id: string
          coin_id: string
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          plan_id: string
          route_id?: string | null
          seq: number
          side: string
          started_at?: string | null
          status?: string
          swap_coin: string
          updated_at?: string
          usd: number
          user_id: string
        }
        Update: {
          amount?: number
          amount_in?: number | null
          amount_out?: number | null
          check_id?: string
          coin_id?: string
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          plan_id?: string
          route_id?: string | null
          seq?: number
          side?: string
          started_at?: string | null
          status?: string
          swap_coin?: string
          updated_at?: string
          usd?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_plan_moves_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "ai_plan_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_plan_moves_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "ai_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_plans: {
        Row: {
          commit_tsd: number
          created_at: string
          execute: boolean
          execute_since: string | null
          id: string
          locked_at: string
          name: string
          next_check_at: string | null
          override_days: string[]
          settings: Json
          start_now_day: string | null
          status: string
          telegram_daily: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          commit_tsd: number
          created_at?: string
          execute?: boolean
          execute_since?: string | null
          id?: string
          locked_at?: string
          name: string
          next_check_at?: string | null
          override_days?: string[]
          settings: Json
          start_now_day?: string | null
          status?: string
          telegram_daily?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          commit_tsd?: number
          created_at?: string
          execute?: boolean
          execute_since?: string | null
          id?: string
          locked_at?: string
          name?: string
          next_check_at?: string | null
          override_days?: string[]
          settings?: Json
          start_now_day?: string | null
          status?: string
          telegram_daily?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_playbook_notes: {
        Row: {
          created_at: string
          goal: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          admin_execution_enabled: boolean
          execution_enabled: boolean
          id: number
          max_commit_tsd: number
          one_tap_limit_usd: number
          one_tap_member_max_usd: number
          updated_at: string
        }
        Insert: {
          admin_execution_enabled?: boolean
          execution_enabled?: boolean
          id?: number
          max_commit_tsd?: number
          one_tap_limit_usd?: number
          one_tap_member_max_usd?: number
          updated_at?: string
        }
        Update: {
          admin_execution_enabled?: boolean
          execution_enabled?: boolean
          id?: number
          max_commit_tsd?: number
          one_tap_limit_usd?: number
          one_tap_member_max_usd?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_sync_requests: {
        Row: {
          coin_id: string | null
          created_at: string
          id: number
          kind: string
        }
        Insert: {
          coin_id?: string | null
          created_at?: string
          id: number
          kind: string
        }
        Update: {
          coin_id?: string | null
          created_at?: string
          id?: number
          kind?: string
        }
        Relationships: []
      }
      alert_log: {
        Row: {
          kind: string
          sent_at: string
          subject: string
          user_id: string
        }
        Insert: {
          kind: string
          sent_at?: string
          subject: string
          user_id: string
        }
        Update: {
          kind?: string
          sent_at?: string
          subject?: string
          user_id?: string
        }
        Relationships: []
      }
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
      chain_snapshots: {
        Row: {
          address: string | null
          bucket: string
          captured_at: string
          chain: string
          chain_lp_actions_paused: boolean | null
          chain_trading_paused: boolean | null
          dust_threshold: number | null
          gas_rate: number | null
          gas_rate_units: string | null
          global_trading_paused: boolean | null
          halted: boolean | null
          observed_fee_rate: number | null
          outbound_fee: number | null
          outbound_tx_size: number | null
          router: string | null
        }
        Insert: {
          address?: string | null
          bucket: string
          captured_at?: string
          chain: string
          chain_lp_actions_paused?: boolean | null
          chain_trading_paused?: boolean | null
          dust_threshold?: number | null
          gas_rate?: number | null
          gas_rate_units?: string | null
          global_trading_paused?: boolean | null
          halted?: boolean | null
          observed_fee_rate?: number | null
          outbound_fee?: number | null
          outbound_tx_size?: number | null
          router?: string | null
        }
        Update: {
          address?: string | null
          bucket?: string
          captured_at?: string
          chain?: string
          chain_lp_actions_paused?: boolean | null
          chain_trading_paused?: boolean | null
          dust_threshold?: number | null
          gas_rate?: number | null
          gas_rate_units?: string | null
          global_trading_paused?: boolean | null
          halted?: boolean | null
          observed_fee_rate?: number | null
          outbound_fee?: number | null
          outbound_tx_size?: number | null
          router?: string | null
        }
        Relationships: []
      }
      client_error_groups: {
        Row: {
          first_seen: string
          handled_at: string | null
          handled_by: string | null
          kind: string
          last_alert_at: string | null
          last_seen: string
          message: string
          occurrences: number
          signature: string
          source: string
        }
        Insert: {
          first_seen?: string
          handled_at?: string | null
          handled_by?: string | null
          kind: string
          last_alert_at?: string | null
          last_seen?: string
          message: string
          occurrences?: number
          signature: string
          source?: string
        }
        Update: {
          first_seen?: string
          handled_at?: string | null
          handled_by?: string | null
          kind?: string
          last_alert_at?: string | null
          last_seen?: string
          message?: string
          occurrences?: number
          signature?: string
          source?: string
        }
        Relationships: []
      }
      client_errors: {
        Row: {
          account_id: string | null
          app_version: string
          browser: string
          created_at: string
          host: string
          id: string
          message: string
          os: string
          page_path: string
          signature: string
          source: string
          viewport: string
        }
        Insert: {
          account_id?: string | null
          app_version?: string
          browser?: string
          created_at?: string
          host?: string
          id?: string
          message: string
          os?: string
          page_path?: string
          signature: string
          source?: string
          viewport?: string
        }
        Update: {
          account_id?: string | null
          app_version?: string
          browser?: string
          created_at?: string
          host?: string
          id?: string
          message?: string
          os?: string
          page_path?: string
          signature?: string
          source?: string
          viewport?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_errors_signature_fkey"
            columns: ["signature"]
            isOneToOne: false
            referencedRelation: "client_error_groups"
            referencedColumns: ["signature"]
          },
        ]
      }
      coin_videos: {
        Row: {
          added_by: string
          channel: string | null
          created_at: string
          id: string
          note: string | null
          slug: string
          title: string
          video_id: string
        }
        Insert: {
          added_by: string
          channel?: string | null
          created_at?: string
          id?: string
          note?: string | null
          slug: string
          title: string
          video_id: string
        }
        Update: {
          added_by?: string
          channel?: string | null
          created_at?: string
          id?: string
          note?: string | null
          slug?: string
          title?: string
          video_id?: string
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
      deposit_sightings: {
        Row: {
          amount: number
          asset: string
          seen_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          asset: string
          seen_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          asset?: string
          seen_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dex_swaps: {
        Row: {
          amount_in: number
          amount_in_units: string | null
          amount_out: number | null
          amount_usd: number
          approval_id: string | null
          approve_txid: string | null
          bridge_fee_bps: number | null
          created_at: string
          decimals_in: number
          decimals_out: number
          error: string | null
          fees: number[] | null
          from_address: string
          id: string
          kind: string | null
          link_id: string
          min_out_units: string | null
          network: string
          path: string[] | null
          quoted_out_units: string | null
          received_units: string | null
          reset_txid: string | null
          router: string | null
          shown_leg_in_units: string | null
          shown_leg_out_units: string | null
          shown_out: number
          slippage_bps: number
          status: string
          step_at: string
          swap_txid: string | null
          symbol_in: string
          symbol_out: string
          token_in: string
          token_out: string
          tsd_address: string | null
          tsd_route_id: string | null
          tsd_side: string | null
          two_step_id: string | null
          updated_at: string
          user_id: string
          venue_id: string | null
          venue_name: string | null
          working_until: string | null
        }
        Insert: {
          amount_in: number
          amount_in_units?: string | null
          amount_out?: number | null
          amount_usd?: number
          approval_id?: string | null
          approve_txid?: string | null
          bridge_fee_bps?: number | null
          created_at?: string
          decimals_in: number
          decimals_out: number
          error?: string | null
          fees?: number[] | null
          from_address: string
          id?: string
          kind?: string | null
          link_id: string
          min_out_units?: string | null
          network: string
          path?: string[] | null
          quoted_out_units?: string | null
          received_units?: string | null
          reset_txid?: string | null
          router?: string | null
          shown_leg_in_units?: string | null
          shown_leg_out_units?: string | null
          shown_out: number
          slippage_bps: number
          status?: string
          step_at?: string
          swap_txid?: string | null
          symbol_in: string
          symbol_out: string
          token_in: string
          token_out: string
          tsd_address?: string | null
          tsd_route_id?: string | null
          tsd_side?: string | null
          two_step_id?: string | null
          updated_at?: string
          user_id: string
          venue_id?: string | null
          venue_name?: string | null
          working_until?: string | null
        }
        Update: {
          amount_in?: number
          amount_in_units?: string | null
          amount_out?: number | null
          amount_usd?: number
          approval_id?: string | null
          approve_txid?: string | null
          bridge_fee_bps?: number | null
          created_at?: string
          decimals_in?: number
          decimals_out?: number
          error?: string | null
          fees?: number[] | null
          from_address?: string
          id?: string
          kind?: string | null
          link_id?: string
          min_out_units?: string | null
          network?: string
          path?: string[] | null
          quoted_out_units?: string | null
          received_units?: string | null
          reset_txid?: string | null
          router?: string | null
          shown_leg_in_units?: string | null
          shown_leg_out_units?: string | null
          shown_out?: number
          slippage_bps?: number
          status?: string
          step_at?: string
          swap_txid?: string | null
          symbol_in?: string
          symbol_out?: string
          token_in?: string
          token_out?: string
          tsd_address?: string | null
          tsd_route_id?: string | null
          tsd_side?: string | null
          two_step_id?: string | null
          updated_at?: string
          user_id?: string
          venue_id?: string | null
          venue_name?: string | null
          working_until?: string | null
        }
        Relationships: []
      }
      escrows: {
        Row: {
          claimed_at: string | null
          confirmations: number
          confirmed_at: string | null
          created_at: string
          expected_amount: number
          funded_amount: number
          funding_txid: string | null
          id: string
          leg: Database["public"]["Enums"]["escrow_leg"]
          multisig_address: string | null
          rebroadcast_at: string | null
          release_txid: string | null
          sent_at: string | null
          sent_from: string | null
          sent_network: string | null
          sent_nonce: number | null
          sent_raw: string | null
          status: Database["public"]["Enums"]["escrow_status"]
          trade_id: string
          updated_at: string
        }
        Insert: {
          claimed_at?: string | null
          confirmations?: number
          confirmed_at?: string | null
          created_at?: string
          expected_amount: number
          funded_amount?: number
          funding_txid?: string | null
          id?: string
          leg: Database["public"]["Enums"]["escrow_leg"]
          multisig_address?: string | null
          rebroadcast_at?: string | null
          release_txid?: string | null
          sent_at?: string | null
          sent_from?: string | null
          sent_network?: string | null
          sent_nonce?: number | null
          sent_raw?: string | null
          status?: Database["public"]["Enums"]["escrow_status"]
          trade_id: string
          updated_at?: string
        }
        Update: {
          claimed_at?: string | null
          confirmations?: number
          confirmed_at?: string | null
          created_at?: string
          expected_amount?: number
          funded_amount?: number
          funding_txid?: string | null
          id?: string
          leg?: Database["public"]["Enums"]["escrow_leg"]
          multisig_address?: string | null
          rebroadcast_at?: string | null
          release_txid?: string | null
          sent_at?: string | null
          sent_from?: string | null
          sent_network?: string | null
          sent_nonce?: number | null
          sent_raw?: string | null
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
      gas_topups: {
        Row: {
          created_at: string
          error: string | null
          id: string
          route_id: string
          status: string
          to_address: string
          txid: string | null
          updated_at: string
          usd: number
          user_id: string
          wei: number
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          route_id: string
          status?: string
          to_address: string
          txid?: string | null
          updated_at?: string
          usd: number
          user_id: string
          wei: number
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          route_id?: string
          status?: string
          to_address?: string
          txid?: string | null
          updated_at?: string
          usd?: number
          user_id?: string
          wei?: number
        }
        Relationships: []
      }
      hme_link_requests: {
        Row: {
          challenge: string
          challenge_id: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          recipient_priv_ciphertext: string
          recipient_pubkey: string
          user_id: string
        }
        Insert: {
          challenge: string
          challenge_id: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          recipient_priv_ciphertext: string
          recipient_pubkey: string
          user_id: string
        }
        Update: {
          challenge?: string
          challenge_id?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          recipient_priv_ciphertext?: string
          recipient_pubkey?: string
          user_id?: string
        }
        Relationships: []
      }
      hme_links: {
        Row: {
          account: number
          created_at: string
          id: string
          identity_address: string
          key_ciphertext: string | null
          key_kind: string | null
          mode: string
          paths: Json
          revoked_at: string | null
          revoked_by: string | null
          source: string
          status: string
          user_id: string
          vault_fingerprint: string | null
          xpubs: Json
        }
        Insert: {
          account: number
          created_at?: string
          id?: string
          identity_address: string
          key_ciphertext?: string | null
          key_kind?: string | null
          mode: string
          paths: Json
          revoked_at?: string | null
          revoked_by?: string | null
          source?: string
          status?: string
          user_id: string
          vault_fingerprint?: string | null
          xpubs: Json
        }
        Update: {
          account?: number
          created_at?: string
          id?: string
          identity_address?: string
          key_ciphertext?: string | null
          key_kind?: string | null
          mode?: string
          paths?: Json
          revoked_at?: string | null
          revoked_by?: string | null
          source?: string
          status?: string
          user_id?: string
          vault_fingerprint?: string | null
          xpubs?: Json
        }
        Relationships: []
      }
      hme_trade_proposals: {
        Row: {
          chain: string
          created_at: string
          expires_at: string
          id: string
          link_id: string
          psbt: string
          responded_at: string | null
          signed_psbt: string | null
          status: string
          summary: string
          trade_id: string | null
          user_id: string
        }
        Insert: {
          chain: string
          created_at?: string
          expires_at: string
          id?: string
          link_id: string
          psbt: string
          responded_at?: string | null
          signed_psbt?: string | null
          status?: string
          summary: string
          trade_id?: string | null
          user_id: string
        }
        Update: {
          chain?: string
          created_at?: string
          expires_at?: string
          id?: string
          link_id?: string
          psbt?: string
          responded_at?: string | null
          signed_psbt?: string | null
          status?: string
          summary?: string
          trade_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hme_trade_proposals_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "hme_links"
            referencedColumns: ["id"]
          },
        ]
      }
      hype_chains: {
        Row: {
          amount_in: number
          amount_out: number | null
          amount_usd: number
          approval_id: string | null
          coin_id: string
          created_at: string
          direction: string
          error: string | null
          eth_baseline_wei: string | null
          id: string
          leg1_id: string | null
          leg2_id: string | null
          link_id: string
          mid_amount: number | null
          mid_handed: number | null
          min_out: number
          pocket: string
          protocol: string | null
          shown_mid: number
          shown_out: number
          slippage_bps: number
          status: string
          step_at: string
          updated_at: string
          user_id: string
          via: string
          working_until: string | null
        }
        Insert: {
          amount_in: number
          amount_out?: number | null
          amount_usd?: number
          approval_id?: string | null
          coin_id: string
          created_at?: string
          direction: string
          error?: string | null
          eth_baseline_wei?: string | null
          id?: string
          leg1_id?: string | null
          leg2_id?: string | null
          link_id: string
          mid_amount?: number | null
          mid_handed?: number | null
          min_out: number
          pocket: string
          protocol?: string | null
          shown_mid: number
          shown_out: number
          slippage_bps: number
          status?: string
          step_at?: string
          updated_at?: string
          user_id: string
          via: string
          working_until?: string | null
        }
        Update: {
          amount_in?: number
          amount_out?: number | null
          amount_usd?: number
          approval_id?: string | null
          coin_id?: string
          created_at?: string
          direction?: string
          error?: string | null
          eth_baseline_wei?: string | null
          id?: string
          leg1_id?: string | null
          leg2_id?: string | null
          link_id?: string
          mid_amount?: number | null
          mid_handed?: number | null
          min_out?: number
          pocket?: string
          protocol?: string | null
          shown_mid?: number
          shown_out?: number
          slippage_bps?: number
          status?: string
          step_at?: string
          updated_at?: string
          user_id?: string
          via?: string
          working_until?: string | null
        }
        Relationships: []
      }
      ignite_admin_emails: {
        Row: {
          id: string
          kind: string
          registration_id: string
          sent_at: string
          sent_by: string
          status: string
          subject: string
          to_email: string
        }
        Insert: {
          id?: string
          kind: string
          registration_id: string
          sent_at?: string
          sent_by: string
          status?: string
          subject: string
          to_email: string
        }
        Update: {
          id?: string
          kind?: string
          registration_id?: string
          sent_at?: string
          sent_by?: string
          status?: string
          subject?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "ignite_admin_emails_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "ignite_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      ignite_classes: {
        Row: {
          agenda: Json
          benefits: Json
          capacity: number
          created_at: string
          deposit_usd: number
          ends_at: string | null
          fee_usd: number
          id: string
          instructor_bio: string | null
          instructor_name: string
          instructor_photo_url: string | null
          location: string
          miners_free: boolean
          name: string
          requirements: string | null
          sessions: Json
          slug: string
          starts_at: string | null
          status: string
          tagline: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          agenda?: Json
          benefits?: Json
          capacity?: number
          created_at?: string
          deposit_usd?: number
          ends_at?: string | null
          fee_usd?: number
          id?: string
          instructor_bio?: string | null
          instructor_name?: string
          instructor_photo_url?: string | null
          location?: string
          miners_free?: boolean
          name: string
          requirements?: string | null
          sessions?: Json
          slug: string
          starts_at?: string | null
          status?: string
          tagline?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          agenda?: Json
          benefits?: Json
          capacity?: number
          created_at?: string
          deposit_usd?: number
          ends_at?: string | null
          fee_usd?: number
          id?: string
          instructor_bio?: string | null
          instructor_name?: string
          instructor_photo_url?: string | null
          location?: string
          miners_free?: boolean
          name?: string
          requirements?: string | null
          sessions?: Json
          slug?: string
          starts_at?: string | null
          status?: string
          tagline?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      ignite_interest: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          last_emailed_at: string | null
          registration_id: string | null
          source: string
          unsubscribed_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          last_emailed_at?: string | null
          registration_id?: string | null
          source: string
          unsubscribed_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          last_emailed_at?: string | null
          registration_id?: string | null
          source?: string
          unsubscribed_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ignite_interest_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "ignite_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      ignite_miner_marks: {
        Row: {
          is_miner: boolean
          note: string | null
          set_at: string
          set_by: string
          user_id: string
        }
        Insert: {
          is_miner: boolean
          note?: string | null
          set_at?: string
          set_by: string
          user_id: string
        }
        Update: {
          is_miner?: boolean
          note?: string | null
          set_at?: string
          set_by?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ignite_miner_marks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ignite_peer_emails: {
        Row: {
          id: string
          link_id: string
          registrant_id: string
          sent_at: string
          to_email: string
        }
        Insert: {
          id?: string
          link_id: string
          registrant_id: string
          sent_at?: string
          to_email: string
        }
        Update: {
          id?: string
          link_id?: string
          registrant_id?: string
          sent_at?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "ignite_peer_emails_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "ignite_peer_links"
            referencedColumns: ["id"]
          },
        ]
      }
      ignite_peer_links: {
        Row: {
          cancelled_at: string | null
          created_at: string
          expires_at: string
          id: string
          invoice_id: string | null
          opened_at: string | null
          paid_at: string | null
          payer_email: string | null
          payer_hm_member_id: string | null
          payer_id: string | null
          payer_name: string | null
          registrant_id: string
          registration_id: string
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          invoice_id?: string | null
          opened_at?: string | null
          paid_at?: string | null
          payer_email?: string | null
          payer_hm_member_id?: string | null
          payer_id?: string | null
          payer_name?: string | null
          registrant_id: string
          registration_id: string
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invoice_id?: string | null
          opened_at?: string | null
          paid_at?: string | null
          payer_email?: string | null
          payer_hm_member_id?: string | null
          payer_id?: string | null
          payer_name?: string | null
          registrant_id?: string
          registration_id?: string
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ignite_peer_links_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "ignite_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      ignite_registrations: {
        Row: {
          amount_usd: number
          checkout_url: string | null
          class_id: string | null
          confirmed_at: string | null
          country_code: string
          created_at: string
          deposit_usd: number | null
          email: string
          fee_usd: number | null
          full_name: string
          hidden_at: string | null
          hm_member_id: string | null
          id: string
          invoice_expires_at: string | null
          invoice_id: string | null
          marketing_opt_in: boolean
          miner_discount_usd: number | null
          notices_done_at: string | null
          paid_amount_usd: number | null
          paid_asset: string | null
          paid_chain: string | null
          payment_method: string
          phone: string
          ref_code: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_usd: number
          checkout_url?: string | null
          class_id?: string | null
          confirmed_at?: string | null
          country_code: string
          created_at?: string
          deposit_usd?: number | null
          email: string
          fee_usd?: number | null
          full_name: string
          hidden_at?: string | null
          hm_member_id?: string | null
          id?: string
          invoice_expires_at?: string | null
          invoice_id?: string | null
          marketing_opt_in?: boolean
          miner_discount_usd?: number | null
          notices_done_at?: string | null
          paid_amount_usd?: number | null
          paid_asset?: string | null
          paid_chain?: string | null
          payment_method?: string
          phone: string
          ref_code?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_usd?: number
          checkout_url?: string | null
          class_id?: string | null
          confirmed_at?: string | null
          country_code?: string
          created_at?: string
          deposit_usd?: number | null
          email?: string
          fee_usd?: number | null
          full_name?: string
          hidden_at?: string | null
          hm_member_id?: string | null
          id?: string
          invoice_expires_at?: string | null
          invoice_id?: string | null
          marketing_opt_in?: boolean
          miner_discount_usd?: number | null
          notices_done_at?: string | null
          paid_amount_usd?: number | null
          paid_asset?: string | null
          paid_chain?: string | null
          payment_method?: string
          phone?: string
          ref_code?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ignite_registrations_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "ignite_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      key_signin_alarm: {
        Row: {
          id: number
          sent_at: string
        }
        Insert: {
          id?: number
          sent_at?: string
        }
        Update: {
          id?: number
          sent_at?: string
        }
        Relationships: []
      }
      key_signin_requests: {
        Row: {
          browser_secret_hash: string
          challenge: string
          challenge_id: string
          claimed_at: string | null
          consumed_at: string | null
          created_account: boolean
          created_at: string
          expires_at: string
          identity_kind: string | null
          ip_hash: string
          link_user_id: string | null
          pending_link: Json | null
          recipient_priv_ciphertext: string
          recipient_pubkey: string
          replace_link_id: string | null
          replace_tries: number
          replaced_at: string | null
          user_id: string | null
          vault_fingerprint: string | null
          vault_request: Json | null
        }
        Insert: {
          browser_secret_hash: string
          challenge: string
          challenge_id: string
          claimed_at?: string | null
          consumed_at?: string | null
          created_account?: boolean
          created_at?: string
          expires_at: string
          identity_kind?: string | null
          ip_hash: string
          link_user_id?: string | null
          pending_link?: Json | null
          recipient_priv_ciphertext: string
          recipient_pubkey: string
          replace_link_id?: string | null
          replace_tries?: number
          replaced_at?: string | null
          user_id?: string | null
          vault_fingerprint?: string | null
          vault_request?: Json | null
        }
        Update: {
          browser_secret_hash?: string
          challenge?: string
          challenge_id?: string
          claimed_at?: string | null
          consumed_at?: string | null
          created_account?: boolean
          created_at?: string
          expires_at?: string
          identity_kind?: string | null
          ip_hash?: string
          link_user_id?: string | null
          pending_link?: Json | null
          recipient_priv_ciphertext?: string
          recipient_pubkey?: string
          replace_link_id?: string | null
          replace_tries?: number
          replaced_at?: string | null
          user_id?: string | null
          vault_fingerprint?: string | null
          vault_request?: Json | null
        }
        Relationships: []
      }
      legacy_account_backups: {
        Row: {
          backed_up_at: string
          email: string | null
          id: string
          legacy_user_id: string
          reason: string
          snapshot: Json
        }
        Insert: {
          backed_up_at?: string
          email?: string | null
          id?: string
          legacy_user_id: string
          reason: string
          snapshot: Json
        }
        Update: {
          backed_up_at?: string
          email?: string | null
          id?: string
          legacy_user_id?: string
          reason?: string
          snapshot?: Json
        }
        Relationships: []
      }
      legacy_account_claims: {
        Row: {
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          hm_member_id: string
          id: string
          legacy_user_id: string
          token_hash: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          hm_member_id: string
          id?: string
          legacy_user_id: string
          token_hash: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          hm_member_id?: string
          id?: string
          legacy_user_id?: string
          token_hash?: string
        }
        Relationships: []
      }
      link_address_tries: {
        Row: {
          link_id: string
          tried_at: string
          tries: number
        }
        Insert: {
          link_id: string
          tried_at?: string
          tries?: number
        }
        Update: {
          link_id?: string
          tried_at?: string
          tries?: number
        }
        Relationships: [
          {
            foreignKeyName: "link_address_tries_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: true
            referencedRelation: "hme_links"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_admin_events: {
        Row: {
          actor: string
          application_id: string | null
          created_at: string
          detail: Json
          id: number
          kind: string
        }
        Insert: {
          actor: string
          application_id?: string | null
          created_at?: string
          detail?: Json
          id?: number
          kind: string
        }
        Update: {
          actor?: string
          application_id?: string | null
          created_at?: string
          detail?: Json
          id?: number
          kind?: string
        }
        Relationships: []
      }
      listing_applications: {
        Row: {
          admin_note: string | null
          amount_usd: number
          checkout_url: string | null
          coin_name: string
          community: string | null
          contact_email: string
          contact_name: string
          contact_telegram: string | null
          contract: string | null
          created_at: string
          discount_usd: number
          id: string
          invoice_expires_at: string | null
          invoice_id: string | null
          list_price_usd: number
          network: string
          notes: string | null
          package: string
          paid_amount_usd: number | null
          paid_asset: string | null
          paid_at: string | null
          paid_chain: string | null
          paid_invoice_id: string | null
          payment_note: string | null
          payment_status: string
          promo_code: string | null
          promo_code_id: string | null
          ref_code: string | null
          reviewed_by: string | null
          status: string
          ticker: string
          updated_at: string
          user_id: string
          website: string
        }
        Insert: {
          admin_note?: string | null
          amount_usd?: number
          checkout_url?: string | null
          coin_name: string
          community?: string | null
          contact_email: string
          contact_name: string
          contact_telegram?: string | null
          contract?: string | null
          created_at?: string
          discount_usd?: number
          id?: string
          invoice_expires_at?: string | null
          invoice_id?: string | null
          list_price_usd?: number
          network: string
          notes?: string | null
          package: string
          paid_amount_usd?: number | null
          paid_asset?: string | null
          paid_at?: string | null
          paid_chain?: string | null
          paid_invoice_id?: string | null
          payment_note?: string | null
          payment_status?: string
          promo_code?: string | null
          promo_code_id?: string | null
          ref_code?: string | null
          reviewed_by?: string | null
          status?: string
          ticker: string
          updated_at?: string
          user_id: string
          website: string
        }
        Update: {
          admin_note?: string | null
          amount_usd?: number
          checkout_url?: string | null
          coin_name?: string
          community?: string | null
          contact_email?: string
          contact_name?: string
          contact_telegram?: string | null
          contract?: string | null
          created_at?: string
          discount_usd?: number
          id?: string
          invoice_expires_at?: string | null
          invoice_id?: string | null
          list_price_usd?: number
          network?: string
          notes?: string | null
          package?: string
          paid_amount_usd?: number | null
          paid_asset?: string | null
          paid_at?: string | null
          paid_chain?: string | null
          paid_invoice_id?: string | null
          payment_note?: string | null
          payment_status?: string
          promo_code?: string | null
          promo_code_id?: string | null
          ref_code?: string | null
          reviewed_by?: string | null
          status?: string
          ticker?: string
          updated_at?: string
          user_id?: string
          website?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_applications_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "listing_promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_invoices: {
        Row: {
          amount_usd: number
          application_id: string
          created_at: string
          invoice_id: string
        }
        Insert: {
          amount_usd: number
          application_id: string
          created_at?: string
          invoice_id: string
        }
        Update: {
          amount_usd?: number
          application_id?: string
          created_at?: string
          invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_invoices_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "listing_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_prices: {
        Row: {
          package: string
          price_usd: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          package: string
          price_usd: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          package?: string
          price_usd?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      listing_promo_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          kind: string
          max_uses: number | null
          note: string | null
          packages: string[] | null
          updated_at: string
          uses: number
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          kind: string
          max_uses?: number | null
          note?: string | null
          packages?: string[] | null
          updated_at?: string
          uses?: number
          value: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          max_uses?: number | null
          note?: string | null
          packages?: string[] | null
          updated_at?: string
          uses?: number
          value?: number
        }
        Relationships: []
      }
      loan_events: {
        Row: {
          actor_id: string | null
          body: string
          created_at: string
          id: number
          kind: string
          loan_id: string
          txid: string | null
        }
        Insert: {
          actor_id?: string | null
          body: string
          created_at?: string
          id?: never
          kind: string
          loan_id: string
          txid?: string | null
        }
        Update: {
          actor_id?: string | null
          body?: string
          created_at?: string
          id?: never
          kind?: string
          loan_id?: string
          txid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_events_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_offers: {
        Row: {
          coin: string
          collateral_coin: string
          created_at: string
          days: number
          id: string
          max_amount: number
          max_ltv_pct: number
          min_amount: number
          note: string | null
          rate_pct: number
          side: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          coin: string
          collateral_coin?: string
          created_at?: string
          days: number
          id?: string
          max_amount: number
          max_ltv_pct: number
          min_amount: number
          note?: string | null
          rate_pct: number
          side: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          coin?: string
          collateral_coin?: string
          created_at?: string
          days?: number
          id?: string
          max_amount?: number
          max_ltv_pct?: number
          min_amount?: number
          note?: string | null
          rate_pct?: number
          side?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      loan_price_marks: {
        Row: {
          at: string
          coin: string
          id: number
          price: number
          source: string
        }
        Insert: {
          at?: string
          coin: string
          id?: never
          price: number
          source: string
        }
        Update: {
          at?: string
          coin?: string
          id?: never
          price?: number
          source?: string
        }
        Relationships: []
      }
      loan_proposals: {
        Row: {
          amount: number
          borrower_id: string
          coin: string
          collateral_coin: string
          created_at: string
          days: number
          decided_at: string | null
          expires_at: string
          id: string
          lender_id: string
          note: string | null
          offer_id: string
          parent_id: string | null
          proposer_id: string
          rate_pct: number
          round: number
          start_ltv_pct: number
          status: string
        }
        Insert: {
          amount: number
          borrower_id: string
          coin: string
          collateral_coin?: string
          created_at?: string
          days: number
          decided_at?: string | null
          expires_at: string
          id?: string
          lender_id: string
          note?: string | null
          offer_id: string
          parent_id?: string | null
          proposer_id: string
          rate_pct: number
          round?: number
          start_ltv_pct: number
          status?: string
        }
        Update: {
          amount?: number
          borrower_id?: string
          coin?: string
          collateral_coin?: string
          created_at?: string
          days?: number
          decided_at?: string | null
          expires_at?: string
          id?: string
          lender_id?: string
          note?: string | null
          offer_id?: string
          parent_id?: string | null
          proposer_id?: string
          rate_pct?: number
          round?: number
          start_ltv_pct?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_proposals_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "loan_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_proposals_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "loan_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          amount: number
          borrower_collateral_address: string
          borrower_id: string
          borrower_pub: string
          closed_at: string | null
          coin: string
          collateral_amount: number
          collateral_coin: string
          collateral_confirmed_at: string | null
          collateral_deadline: string
          collateral_seen: number
          created_at: string
          days: number
          due_at: string | null
          escrow_address: string
          escrow_claimed_at: string | null
          escrow_hex: string | null
          escrow_price: number | null
          escrow_purpose: string | null
          escrow_split: Json | null
          escrow_txid: string | null
          fee_pct: number
          funded_at: string | null
          funding_confirmed_at: string | null
          funding_deadline: string | null
          funding_network: string | null
          funding_started_at: string | null
          funding_to: string | null
          funding_txid: string | null
          id: string
          last_checked_at: string | null
          last_ltv_pct: number | null
          last_price: number | null
          lender_collateral_address: string
          lender_id: string
          lender_pub: string
          margin_called_at: string | null
          offer_id: string
          outcome: string | null
          owed: number
          price_at_start: number
          proposal_id: string
          rate_pct: number
          redeem_script: string
          ref: string
          repaid_confirmed_at: string | null
          repay_network: string | null
          repay_sent_at: string | null
          repay_started_at: string | null
          repay_to: string | null
          repay_txid: string | null
          seeds_fee_address: string
          seeds_pub: string
          start_ltv_pct: number
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          borrower_collateral_address: string
          borrower_id: string
          borrower_pub: string
          closed_at?: string | null
          coin: string
          collateral_amount: number
          collateral_coin: string
          collateral_confirmed_at?: string | null
          collateral_deadline: string
          collateral_seen?: number
          created_at?: string
          days: number
          due_at?: string | null
          escrow_address: string
          escrow_claimed_at?: string | null
          escrow_hex?: string | null
          escrow_price?: number | null
          escrow_purpose?: string | null
          escrow_split?: Json | null
          escrow_txid?: string | null
          fee_pct: number
          funded_at?: string | null
          funding_confirmed_at?: string | null
          funding_deadline?: string | null
          funding_network?: string | null
          funding_started_at?: string | null
          funding_to?: string | null
          funding_txid?: string | null
          id?: string
          last_checked_at?: string | null
          last_ltv_pct?: number | null
          last_price?: number | null
          lender_collateral_address: string
          lender_id: string
          lender_pub: string
          margin_called_at?: string | null
          offer_id: string
          outcome?: string | null
          owed: number
          price_at_start: number
          proposal_id: string
          rate_pct: number
          redeem_script: string
          ref: string
          repaid_confirmed_at?: string | null
          repay_network?: string | null
          repay_sent_at?: string | null
          repay_started_at?: string | null
          repay_to?: string | null
          repay_txid?: string | null
          seeds_fee_address: string
          seeds_pub: string
          start_ltv_pct: number
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          borrower_collateral_address?: string
          borrower_id?: string
          borrower_pub?: string
          closed_at?: string | null
          coin?: string
          collateral_amount?: number
          collateral_coin?: string
          collateral_confirmed_at?: string | null
          collateral_deadline?: string
          collateral_seen?: number
          created_at?: string
          days?: number
          due_at?: string | null
          escrow_address?: string
          escrow_claimed_at?: string | null
          escrow_hex?: string | null
          escrow_price?: number | null
          escrow_purpose?: string | null
          escrow_split?: Json | null
          escrow_txid?: string | null
          fee_pct?: number
          funded_at?: string | null
          funding_confirmed_at?: string | null
          funding_deadline?: string | null
          funding_network?: string | null
          funding_started_at?: string | null
          funding_to?: string | null
          funding_txid?: string | null
          id?: string
          last_checked_at?: string | null
          last_ltv_pct?: number | null
          last_price?: number | null
          lender_collateral_address?: string
          lender_id?: string
          lender_pub?: string
          margin_called_at?: string | null
          offer_id?: string
          outcome?: string | null
          owed?: number
          price_at_start?: number
          proposal_id?: string
          rate_pct?: number
          redeem_script?: string
          ref?: string
          repaid_confirmed_at?: string | null
          repay_network?: string | null
          repay_sent_at?: string | null
          repay_started_at?: string | null
          repay_to?: string | null
          repay_txid?: string | null
          seeds_fee_address?: string
          seeds_pub?: string
          start_ltv_pct?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "loan_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "loan_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      lock_signed_outpoints: {
        Row: {
          created_at: string
          spend_id: string
          txid: string
          vout: number
        }
        Insert: {
          created_at?: string
          spend_id: string
          txid: string
          vout: number
        }
        Update: {
          created_at?: string
          spend_id?: string
          txid?: string
          vout?: number
        }
        Relationships: [
          {
            foreignKeyName: "lock_signed_outpoints_spend_id_fkey"
            columns: ["spend_id"]
            isOneToOne: false
            referencedRelation: "lock_spends"
            referencedColumns: ["id"]
          },
        ]
      }
      lock_spends: {
        Row: {
          amount: string | null
          created_at: string
          error: string | null
          expires_at: string
          id: string
          inputs: Json
          lock_id: string
          pair_id: string | null
          property_id: number | null
          purpose: string
          signed_txid: string | null
          status: string
          to_address: string
          trade_id: string | null
          unsigned_hex: string
          unsigned_sha256: string
          updated_at: string
        }
        Insert: {
          amount?: string | null
          created_at?: string
          error?: string | null
          expires_at: string
          id?: string
          inputs: Json
          lock_id: string
          pair_id?: string | null
          property_id?: number | null
          purpose: string
          signed_txid?: string | null
          status?: string
          to_address: string
          trade_id?: string | null
          unsigned_hex: string
          unsigned_sha256: string
          updated_at?: string
        }
        Update: {
          amount?: string | null
          created_at?: string
          error?: string | null
          expires_at?: string
          id?: string
          inputs?: Json
          lock_id?: string
          pair_id?: string | null
          property_id?: number | null
          purpose?: string
          signed_txid?: string | null
          status?: string
          to_address?: string
          trade_id?: string | null
          unsigned_hex?: string
          unsigned_sha256?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lock_spends_lock_id_fkey"
            columns: ["lock_id"]
            isOneToOne: false
            referencedRelation: "trade_locks"
            referencedColumns: ["id"]
          },
        ]
      }
      market_snapshots: {
        Row: {
          base: string
          captured_at: string
          change_pct: number | null
          day: string
          liquidity: number | null
          live: boolean
          name: string
          pool: string
          price: number
          slug: string
          volume_24h: number
        }
        Insert: {
          base: string
          captured_at?: string
          change_pct?: number | null
          day: string
          liquidity?: number | null
          live?: boolean
          name: string
          pool: string
          price: number
          slug: string
          volume_24h?: number
        }
        Update: {
          base?: string
          captured_at?: string
          change_pct?: number | null
          day?: string
          liquidity?: number | null
          live?: boolean
          name?: string
          pool?: string
          price?: number
          slug?: string
          volume_24h?: number
        }
        Relationships: []
      }
      market_snapshots_5min: {
        Row: {
          asset_tor_price: number | null
          balance_asset: number | null
          balance_rune: number | null
          base: string
          bucket: string
          captured_at: string
          change_pct: number | null
          derived_depth_bps: number | null
          liquidity: number | null
          live: boolean
          lp_units: number | null
          name: string
          pending_inbound_asset: number | null
          pending_inbound_rune: number | null
          pool: string
          pool_units: number | null
          price: number
          savers_capacity_remaining: number | null
          savers_depth: number | null
          savers_fill_bps: number | null
          savers_units: number | null
          short_code: string | null
          slug: string
          status: string | null
          synth_mint_paused: boolean | null
          synth_supply: number | null
          synth_supply_remaining: number | null
          synth_units: number | null
          trading_halted: boolean | null
          volume_24h: number
          volume_asset: number | null
          volume_rune: number | null
        }
        Insert: {
          asset_tor_price?: number | null
          balance_asset?: number | null
          balance_rune?: number | null
          base: string
          bucket: string
          captured_at?: string
          change_pct?: number | null
          derived_depth_bps?: number | null
          liquidity?: number | null
          live?: boolean
          lp_units?: number | null
          name: string
          pending_inbound_asset?: number | null
          pending_inbound_rune?: number | null
          pool: string
          pool_units?: number | null
          price: number
          savers_capacity_remaining?: number | null
          savers_depth?: number | null
          savers_fill_bps?: number | null
          savers_units?: number | null
          short_code?: string | null
          slug: string
          status?: string | null
          synth_mint_paused?: boolean | null
          synth_supply?: number | null
          synth_supply_remaining?: number | null
          synth_units?: number | null
          trading_halted?: boolean | null
          volume_24h?: number
          volume_asset?: number | null
          volume_rune?: number | null
        }
        Update: {
          asset_tor_price?: number | null
          balance_asset?: number | null
          balance_rune?: number | null
          base?: string
          bucket?: string
          captured_at?: string
          change_pct?: number | null
          derived_depth_bps?: number | null
          liquidity?: number | null
          live?: boolean
          lp_units?: number | null
          name?: string
          pending_inbound_asset?: number | null
          pending_inbound_rune?: number | null
          pool?: string
          pool_units?: number | null
          price?: number
          savers_capacity_remaining?: number | null
          savers_depth?: number | null
          savers_fill_bps?: number | null
          savers_units?: number | null
          short_code?: string | null
          slug?: string
          status?: string | null
          synth_mint_paused?: boolean | null
          synth_supply?: number | null
          synth_supply_remaining?: number | null
          synth_units?: number | null
          trading_halted?: boolean | null
          volume_24h?: number
          volume_asset?: number | null
          volume_rune?: number | null
        }
        Relationships: []
      }
      market_snapshots_hourly: {
        Row: {
          hour: string
          liquidity_avg: number | null
          liquidity_min: number | null
          price_close: number | null
          price_high: number | null
          price_low: number | null
          price_open: number | null
          samples: number
          slug: string
          volume_24h_avg: number | null
        }
        Insert: {
          hour: string
          liquidity_avg?: number | null
          liquidity_min?: number | null
          price_close?: number | null
          price_high?: number | null
          price_low?: number | null
          price_open?: number | null
          samples?: number
          slug: string
          volume_24h_avg?: number | null
        }
        Update: {
          hour?: string
          liquidity_avg?: number | null
          liquidity_min?: number | null
          price_close?: number | null
          price_high?: number | null
          price_low?: number | null
          price_open?: number | null
          samples?: number
          slug?: string
          volume_24h_avg?: number | null
        }
        Relationships: []
      }
      miner_check_health: {
        Row: {
          fails_in_a_row: number
          id: string
          last_fail_at: string | null
          last_fail_reason: string | null
          last_ok_at: string | null
          updated_at: string
        }
        Insert: {
          fails_in_a_row?: number
          id?: string
          last_fail_at?: string | null
          last_fail_reason?: string | null
          last_ok_at?: string | null
          updated_at?: string
        }
        Update: {
          fails_in_a_row?: number
          id?: string
          last_fail_at?: string | null
          last_fail_reason?: string | null
          last_ok_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      monero_rpc_lease: {
        Row: {
          holder: string | null
          id: number
          until: string
        }
        Insert: {
          holder?: string | null
          id?: number
          until?: string
        }
        Update: {
          holder?: string | null
          id?: number
          until?: string
        }
        Relationships: []
      }
      monero_wallets: {
        Row: {
          address: string
          balance_units: number | null
          created_at: string
          error: string | null
          link_id: string
          restore_height: number | null
          scanned_at: string | null
          scanned_height: number | null
          status: string
          tries: number
          unlocked_units: number | null
          updated_at: string
          user_id: string
          wallet_name: string
        }
        Insert: {
          address: string
          balance_units?: number | null
          created_at?: string
          error?: string | null
          link_id: string
          restore_height?: number | null
          scanned_at?: string | null
          scanned_height?: number | null
          status?: string
          tries?: number
          unlocked_units?: number | null
          updated_at?: string
          user_id: string
          wallet_name: string
        }
        Update: {
          address?: string
          balance_units?: number | null
          created_at?: string
          error?: string | null
          link_id?: string
          restore_height?: number | null
          scanned_at?: string | null
          scanned_height?: number | null
          status?: string
          tries?: number
          unlocked_units?: number | null
          updated_at?: string
          user_id?: string
          wallet_name?: string
        }
        Relationships: []
      }
      nectarpay_events: {
        Row: {
          event_id: string
          invoice_id: string | null
          payload: Json
          received_at: string
          type: string
        }
        Insert: {
          event_id: string
          invoice_id?: string | null
          payload: Json
          received_at?: string
          type: string
        }
        Update: {
          event_id?: string
          invoice_id?: string | null
          payload?: Json
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      network_snapshots: {
        Row: {
          asgard_size: number | null
          bucket: string
          captured_at: string
          desired_validator_set: number | null
          native_tx_fee: number | null
          nodes_active: number | null
          nodes_jailed: number | null
          nodes_maintenance: number | null
          nodes_missing_blocks: number | null
          nodes_total: number | null
          outbound_tx_fee: number | null
          scheduled_queue: number | null
        }
        Insert: {
          asgard_size?: number | null
          bucket: string
          captured_at?: string
          desired_validator_set?: number | null
          native_tx_fee?: number | null
          nodes_active?: number | null
          nodes_jailed?: number | null
          nodes_maintenance?: number | null
          nodes_missing_blocks?: number | null
          nodes_total?: number | null
          outbound_tx_fee?: number | null
          scheduled_queue?: number | null
        }
        Update: {
          asgard_size?: number | null
          bucket?: string
          captured_at?: string
          desired_validator_set?: number | null
          native_tx_fee?: number | null
          nodes_active?: number | null
          nodes_jailed?: number | null
          nodes_maintenance?: number | null
          nodes_missing_blocks?: number | null
          nodes_total?: number | null
          outbound_tx_fee?: number | null
          scheduled_queue?: number | null
        }
        Relationships: []
      }
      one_tap_limit_events: {
        Row: {
          created_at: string
          id: string
          new_limit_usd: number | null
          old_limit_usd: number | null
          user_id: string
          with_code: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          new_limit_usd?: number | null
          old_limit_usd?: number | null
          user_id: string
          with_code?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          new_limit_usd?: number | null
          old_limit_usd?: number | null
          user_id?: string
          with_code?: boolean
        }
        Relationships: []
      }
      order_cover_flags: {
        Row: {
          first_seen_at: string
          leg: string
          user_id: string
        }
        Insert: {
          first_seen_at?: string
          leg: string
          user_id: string
        }
        Update: {
          first_seen_at?: string
          leg?: string
          user_id?: string
        }
        Relationships: []
      }
      order_requests: {
        Row: {
          amount: number
          created_at: string
          decided_at: string | null
          error: string | null
          id: string
          order_type: string
          pair: string
          price: number
          result: Json | null
          side: string
          slippage_pct: number | null
          status: string
          user_id: string
          working_until: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          decided_at?: string | null
          error?: string | null
          id?: string
          order_type: string
          pair: string
          price: number
          result?: Json | null
          side: string
          slippage_pct?: number | null
          status?: string
          user_id: string
          working_until?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          decided_at?: string | null
          error?: string | null
          id?: string
          order_type?: string
          pair?: string
          price?: number
          result?: Json | null
          side?: string
          slippage_pct?: number | null
          status?: string
          user_id?: string
          working_until?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount: number
          cancel_reason: string | null
          created_at: string
          filled: number
          id: string
          is_demo: boolean
          order_type: string
          pair: string
          price: number
          side: Database["public"]["Enums"]["order_side"]
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          cancel_reason?: string | null
          created_at?: string
          filled?: number
          id?: string
          is_demo?: boolean
          order_type?: string
          pair?: string
          price: number
          side: Database["public"]["Enums"]["order_side"]
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          cancel_reason?: string | null
          created_at?: string
          filled?: number
          id?: string
          is_demo?: boolean
          order_type?: string
          pair?: string
          price?: number
          side?: Database["public"]["Enums"]["order_side"]
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      p2p_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      p2p_dispute_votes: {
        Row: {
          created_at: string
          id: string
          note: string
          trade_id: string
          vote: string
          voter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string
          trade_id: string
          vote: string
          voter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          trade_id?: string
          vote?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "p2p_dispute_votes_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "p2p_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      p2p_feedback: {
        Row: {
          comment: string
          created_at: string
          from_id: string
          id: string
          positive: boolean
          to_id: string
          trade_id: string
        }
        Insert: {
          comment?: string
          created_at?: string
          from_id: string
          id?: string
          positive: boolean
          to_id: string
          trade_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          from_id?: string
          id?: string
          positive?: boolean
          to_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "p2p_feedback_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "p2p_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      p2p_messages: {
        Row: {
          attachment_name: string | null
          attachment_path: string | null
          body: string
          created_at: string
          id: string
          sender_id: string | null
          trade_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_path?: string | null
          body: string
          created_at?: string
          id?: string
          sender_id?: string | null
          trade_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_path?: string | null
          body?: string
          created_at?: string
          id?: string
          sender_id?: string | null
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "p2p_messages_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "p2p_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      p2p_offer_instructions: {
        Row: {
          instructions: string
          offer_id: string
        }
        Insert: {
          instructions?: string
          offer_id: string
        }
        Update: {
          instructions?: string
          offer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "p2p_offer_instructions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: true
            referencedRelation: "p2p_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      p2p_offers: {
        Row: {
          active: boolean
          asset: string
          auto_reply: string
          created_at: string
          fee_pct: number
          id: string
          margin_pct: number
          max_fiat: number
          min_counterparty_trades: number
          min_fiat: number
          new_buyer_max_fiat: number
          payment_methods: string[]
          price: number
          price_mode: string
          seller_id: string
          side: string
          terms: string
          updated_at: string
          verified_at: string | null
          verified_balance: number
          window_minutes: number
        }
        Insert: {
          active?: boolean
          asset: string
          auto_reply?: string
          created_at?: string
          fee_pct?: number
          id?: string
          margin_pct?: number
          max_fiat?: number
          min_counterparty_trades?: number
          min_fiat?: number
          new_buyer_max_fiat?: number
          payment_methods?: string[]
          price: number
          price_mode?: string
          seller_id: string
          side?: string
          terms?: string
          updated_at?: string
          verified_at?: string | null
          verified_balance?: number
          window_minutes?: number
        }
        Update: {
          active?: boolean
          asset?: string
          auto_reply?: string
          created_at?: string
          fee_pct?: number
          id?: string
          margin_pct?: number
          max_fiat?: number
          min_counterparty_trades?: number
          min_fiat?: number
          new_buyer_max_fiat?: number
          payment_methods?: string[]
          price?: number
          price_mode?: string
          seller_id?: string
          side?: string
          terms?: string
          updated_at?: string
          verified_at?: string | null
          verified_balance?: number
          window_minutes?: number
        }
        Relationships: []
      }
      p2p_profiles: {
        Row: {
          away: boolean
          bio: string
          country: string | null
          created_at: string
          handle: string
          hours: string
          hours_from: number | null
          hours_to: number | null
          languages: string[]
          last_seen_at: string | null
          location: string
          payment_details: Json
          quick_replies: string[]
          tz: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          away?: boolean
          bio?: string
          country?: string | null
          created_at?: string
          handle: string
          hours?: string
          hours_from?: number | null
          hours_to?: number | null
          languages?: string[]
          last_seen_at?: string | null
          location?: string
          payment_details?: Json
          quick_replies?: string[]
          tz?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          away?: boolean
          bio?: string
          country?: string | null
          created_at?: string
          handle?: string
          hours?: string
          hours_from?: number | null
          hours_to?: number | null
          languages?: string[]
          last_seen_at?: string | null
          location?: string
          payment_details?: Json
          quick_replies?: string[]
          tz?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      p2p_reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reported_id: string
          reporter_id: string
          status: string
          trade_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reported_id: string
          reporter_id: string
          status?: string
          trade_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reported_id?: string
          reporter_id?: string
          status?: string
          trade_id?: string | null
        }
        Relationships: []
      }
      p2p_trades: {
        Row: {
          asset: string
          buyer_address: string
          buyer_id: string
          cancelled_at: string | null
          created_at: string
          crypto_amount: number
          dispute_reason: string | null
          disputed_by: string | null
          expires_at: string
          fee_fiat: number
          fee_pct: number
          fiat_amount: number
          flagged_reason: string | null
          id: string
          instructions: string
          offer_id: string
          paid_at: string | null
          payment_method: string
          price: number
          release_txid: string | null
          released_at: string | null
          resolution: string | null
          resolved_by: string | null
          seller_id: string
          seller_seen_at: string | null
          status: string
        }
        Insert: {
          asset: string
          buyer_address: string
          buyer_id: string
          cancelled_at?: string | null
          created_at?: string
          crypto_amount: number
          dispute_reason?: string | null
          disputed_by?: string | null
          expires_at: string
          fee_fiat?: number
          fee_pct?: number
          fiat_amount: number
          flagged_reason?: string | null
          id?: string
          instructions?: string
          offer_id: string
          paid_at?: string | null
          payment_method: string
          price: number
          release_txid?: string | null
          released_at?: string | null
          resolution?: string | null
          resolved_by?: string | null
          seller_id: string
          seller_seen_at?: string | null
          status?: string
        }
        Update: {
          asset?: string
          buyer_address?: string
          buyer_id?: string
          cancelled_at?: string | null
          created_at?: string
          crypto_amount?: number
          dispute_reason?: string | null
          disputed_by?: string | null
          expires_at?: string
          fee_fiat?: number
          fee_pct?: number
          fiat_amount?: number
          flagged_reason?: string | null
          id?: string
          instructions?: string
          offer_id?: string
          paid_at?: string | null
          payment_method?: string
          price?: number
          release_txid?: string | null
          released_at?: string | null
          resolution?: string | null
          resolved_by?: string | null
          seller_id?: string
          seller_seen_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "p2p_trades_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "p2p_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      pocket_addresses: {
        Row: {
          address: string
          address_lc: string | null
          coin: string
          created_at: string
          link_id: string
          user_id: string
        }
        Insert: {
          address: string
          address_lc?: string | null
          coin: string
          created_at?: string
          link_id: string
          user_id: string
        }
        Update: {
          address?: string
          address_lc?: string | null
          coin?: string
          created_at?: string
          link_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pocket_addresses_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "hme_links"
            referencedColumns: ["id"]
          },
        ]
      }
      pocket_deposit_sync: {
        Row: {
          backfilled: Json
          synced_at: string | null
          user_id: string
          working_until: string | null
        }
        Insert: {
          backfilled?: Json
          synced_at?: string | null
          user_id: string
          working_until?: string | null
        }
        Update: {
          backfilled?: Json
          synced_at?: string | null
          user_id?: string
          working_until?: string | null
        }
        Relationships: []
      }
      pocket_deposit_watch: {
        Row: {
          address: string
          amount: number
          coin_key: string
          seen_at: string
          user_id: string
        }
        Insert: {
          address: string
          amount: number
          coin_key: string
          seen_at?: string
          user_id: string
        }
        Update: {
          address?: string
          amount?: number
          coin_key?: string
          seen_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pocket_deposits: {
        Row: {
          address: string
          amount: number
          block_time: string | null
          coin: string
          from_address: string | null
          from_seeds: string | null
          id: string
          network: string
          seen_at: string
          source: string
          token_address: string | null
          tx_url: string | null
          txid: string
          user_id: string
        }
        Insert: {
          address: string
          amount: number
          block_time?: string | null
          coin: string
          from_address?: string | null
          from_seeds?: string | null
          id?: string
          network: string
          seen_at?: string
          source: string
          token_address?: string | null
          tx_url?: string | null
          txid: string
          user_id: string
        }
        Update: {
          address?: string
          amount?: number
          block_time?: string | null
          coin?: string
          from_address?: string | null
          from_seeds?: string | null
          id?: string
          network?: string
          seen_at?: string
          source?: string
          token_address?: string | null
          tx_url?: string | null
          txid?: string
          user_id?: string
        }
        Relationships: []
      }
      pocket_spend_locks: {
        Row: {
          expires_at: string
          token: string
          user_id: string
        }
        Insert: {
          expires_at: string
          token: string
          user_id: string
        }
        Update: {
          expires_at?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      pocket_withdrawals: {
        Row: {
          amount: number
          amount_units: string
          amount_usd: number
          approval_id: string | null
          approved_at: string | null
          cancelled_at: string | null
          chain: string
          coin: string
          confirmations: number | null
          created_at: string
          destination_tag: number | null
          error: string | null
          from_address: string
          hold_hours: number
          id: string
          link_id: string
          release_at: string
          send_meta: Json | null
          sent_at: string | null
          status: string
          to_address: string
          txid: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          amount_units: string
          amount_usd: number
          approval_id?: string | null
          approved_at?: string | null
          cancelled_at?: string | null
          chain?: string
          coin: string
          confirmations?: number | null
          created_at?: string
          destination_tag?: number | null
          error?: string | null
          from_address: string
          hold_hours?: number
          id?: string
          link_id: string
          release_at: string
          send_meta?: Json | null
          sent_at?: string | null
          status?: string
          to_address: string
          txid?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          amount_units?: string
          amount_usd?: number
          approval_id?: string | null
          approved_at?: string | null
          cancelled_at?: string | null
          chain?: string
          coin?: string
          confirmations?: number | null
          created_at?: string
          destination_tag?: number | null
          error?: string | null
          from_address?: string
          hold_hours?: number
          id?: string
          link_id?: string
          release_at?: string
          send_meta?: Json | null
          sent_at?: string | null
          status?: string
          to_address?: string
          txid?: string | null
          updated_at?: string
          user_id?: string
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
          email_trade_confirmations: boolean
          email_weekly_update: boolean
          hm_member_id: string | null
          hm_status: string
          id: string
          identity_address: string | null
          identity_kind: string
          notify_auth_expiring: boolean
          notify_deposit: boolean
          notify_login: boolean
          notify_order_filled: boolean
          notify_p2p: boolean
          notify_settlement: boolean
          notify_settlement_failed: boolean
          notify_weekly_digest: boolean
          onboarding_at: string | null
          onboarding_status: string | null
          one_tap_limit_set_at: string | null
          one_tap_limit_usd: number | null
          order_pause_cleared_at: string | null
          reputation: number
          telegram_chat_id: string | null
          telegram_code: string | null
          telegram_code_expires_at: string | null
          telegram_code_trusted: boolean
          telegram_verified: boolean
          telegram_verified_at: string | null
          timezone: string
          trades_completed: number
          trading_frozen_at: string | null
          trading_frozen_reason: string | null
          trading_frozen_trade: string | null
          two_factor_on: boolean
          updated_at: string
        }
        Insert: {
          confirm_before_order?: boolean
          created_at?: string
          default_auth_cap?: number | null
          default_auth_hours?: number
          default_pair?: string | null
          display_name?: string
          email_trade_confirmations?: boolean
          email_weekly_update?: boolean
          hm_member_id?: string | null
          hm_status?: string
          id: string
          identity_address?: string | null
          identity_kind?: string
          notify_auth_expiring?: boolean
          notify_deposit?: boolean
          notify_login?: boolean
          notify_order_filled?: boolean
          notify_p2p?: boolean
          notify_settlement?: boolean
          notify_settlement_failed?: boolean
          notify_weekly_digest?: boolean
          onboarding_at?: string | null
          onboarding_status?: string | null
          one_tap_limit_set_at?: string | null
          one_tap_limit_usd?: number | null
          order_pause_cleared_at?: string | null
          reputation?: number
          telegram_chat_id?: string | null
          telegram_code?: string | null
          telegram_code_expires_at?: string | null
          telegram_code_trusted?: boolean
          telegram_verified?: boolean
          telegram_verified_at?: string | null
          timezone?: string
          trades_completed?: number
          trading_frozen_at?: string | null
          trading_frozen_reason?: string | null
          trading_frozen_trade?: string | null
          two_factor_on?: boolean
          updated_at?: string
        }
        Update: {
          confirm_before_order?: boolean
          created_at?: string
          default_auth_cap?: number | null
          default_auth_hours?: number
          default_pair?: string | null
          display_name?: string
          email_trade_confirmations?: boolean
          email_weekly_update?: boolean
          hm_member_id?: string | null
          hm_status?: string
          id?: string
          identity_address?: string | null
          identity_kind?: string
          notify_auth_expiring?: boolean
          notify_deposit?: boolean
          notify_login?: boolean
          notify_order_filled?: boolean
          notify_p2p?: boolean
          notify_settlement?: boolean
          notify_settlement_failed?: boolean
          notify_weekly_digest?: boolean
          onboarding_at?: string | null
          onboarding_status?: string | null
          one_tap_limit_set_at?: string | null
          one_tap_limit_usd?: number | null
          order_pause_cleared_at?: string | null
          reputation?: number
          telegram_chat_id?: string | null
          telegram_code?: string | null
          telegram_code_expires_at?: string | null
          telegram_code_trusted?: boolean
          telegram_verified?: boolean
          telegram_verified_at?: string | null
          timezone?: string
          trades_completed?: number
          trading_frozen_at?: string | null
          trading_frozen_reason?: string | null
          trading_frozen_trade?: string | null
          two_factor_on?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      qa_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          kind: string
          mime: string
          redacted: boolean
          report_id: string
          size_bytes: number
          storage_path: string
          uploaded: boolean
        }
        Insert: {
          created_at?: string
          file_name?: string
          id?: string
          kind: string
          mime: string
          redacted?: boolean
          report_id: string
          size_bytes: number
          storage_path: string
          uploaded?: boolean
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          kind?: string
          mime?: string
          redacted?: boolean
          report_id?: string
          size_bytes?: number
          storage_path?: string
          uploaded?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "qa_attachments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "qa_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          from_team: boolean
          id: string
          internal: boolean
          report_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          from_team?: boolean
          id?: string
          internal?: boolean
          report_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          from_team?: boolean
          id?: string
          internal?: boolean
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_comments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "qa_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_events: {
        Row: {
          actor_id: string
          created_at: string
          field: string
          from_value: string | null
          id: string
          report_id: string
          to_value: string | null
        }
        Insert: {
          actor_id: string
          created_at?: string
          field: string
          from_value?: string | null
          id?: string
          report_id: string
          to_value?: string | null
        }
        Update: {
          actor_id?: string
          created_at?: string
          field?: string
          from_value?: string | null
          id?: string
          report_id?: string
          to_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qa_events_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "qa_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_reports: {
        Row: {
          actual: string
          app_version: string
          assignee_id: string | null
          browser: string
          category: string
          created_at: string
          description: string
          duplicate_of: string | null
          expected: string
          id: string
          os: string
          page_path: string
          ref_no: number
          reporter_id: string
          severity: string | null
          status: string
          steps: string
          title: string
          updated_at: string
          viewport: string
        }
        Insert: {
          actual?: string
          app_version?: string
          assignee_id?: string | null
          browser?: string
          category: string
          created_at?: string
          description?: string
          duplicate_of?: string | null
          expected?: string
          id?: string
          os?: string
          page_path?: string
          ref_no?: never
          reporter_id: string
          severity?: string | null
          status?: string
          steps?: string
          title: string
          updated_at?: string
          viewport?: string
        }
        Update: {
          actual?: string
          app_version?: string
          assignee_id?: string | null
          browser?: string
          category?: string
          created_at?: string
          description?: string
          duplicate_of?: string | null
          expected?: string
          id?: string
          os?: string
          page_path?: string
          ref_no?: never
          reporter_id?: string
          severity?: string | null
          status?: string
          steps?: string
          title?: string
          updated_at?: string
          viewport?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_reports_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "qa_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_settings: {
        Row: {
          enabled: boolean
          error_log_enabled: boolean
          id: number
          recordings_enabled: boolean
          telegram_chat_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          error_log_enabled?: boolean
          id?: number
          recordings_enabled?: boolean
          telegram_chat_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          error_log_enabled?: boolean
          id?: number
          recordings_enabled?: boolean
          telegram_chat_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      recruit_events: {
        Row: {
          actor: string | null
          created_at: string
          detail: Json
          id: string
          kind: string
          lead_id: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          detail?: Json
          id?: string
          kind: string
          lead_id: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          detail?: Json
          id?: string
          kind?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruit_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "recruit_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      recruit_leads: {
        Row: {
          chain: string | null
          cmc_id: number | null
          cmc_slug: string | null
          contact_name: string | null
          contract: string | null
          created_at: string
          created_by: string | null
          date_added: string | null
          dedupe_key: string
          discord: string | null
          email: string | null
          facts_at: string | null
          finder: string | null
          id: string
          last_contacted_at: string | null
          market_cap_usd: number | null
          name: string
          notes: string | null
          num_market_pairs: number | null
          score: number
          score_reasons: Json
          source: string
          source_detail: string | null
          stage: string
          symbol: string
          tags: string[]
          telegram: string | null
          twitter: string | null
          updated_at: string
          volume_24h_usd: number | null
          website: string | null
        }
        Insert: {
          chain?: string | null
          cmc_id?: number | null
          cmc_slug?: string | null
          contact_name?: string | null
          contract?: string | null
          created_at?: string
          created_by?: string | null
          date_added?: string | null
          dedupe_key: string
          discord?: string | null
          email?: string | null
          facts_at?: string | null
          finder?: string | null
          id?: string
          last_contacted_at?: string | null
          market_cap_usd?: number | null
          name: string
          notes?: string | null
          num_market_pairs?: number | null
          score?: number
          score_reasons?: Json
          source: string
          source_detail?: string | null
          stage?: string
          symbol: string
          tags?: string[]
          telegram?: string | null
          twitter?: string | null
          updated_at?: string
          volume_24h_usd?: number | null
          website?: string | null
        }
        Update: {
          chain?: string | null
          cmc_id?: number | null
          cmc_slug?: string | null
          contact_name?: string | null
          contract?: string | null
          created_at?: string
          created_by?: string | null
          date_added?: string | null
          dedupe_key?: string
          discord?: string | null
          email?: string | null
          facts_at?: string | null
          finder?: string | null
          id?: string
          last_contacted_at?: string | null
          market_cap_usd?: number | null
          name?: string
          notes?: string | null
          num_market_pairs?: number | null
          score?: number
          score_reasons?: Json
          source?: string
          source_detail?: string | null
          stage?: string
          symbol?: string
          tags?: string[]
          telegram?: string | null
          twitter?: string | null
          updated_at?: string
          volume_24h_usd?: number | null
          website?: string | null
        }
        Relationships: []
      }
      recruit_messages: {
        Row: {
          ai_written: boolean
          body: string
          channel: string
          created_at: string
          created_by: string
          id: string
          lead_id: string
          sent_at: string | null
          sent_by: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          ai_written?: boolean
          body: string
          channel: string
          created_at?: string
          created_by: string
          id?: string
          lead_id: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          ai_written?: boolean
          body?: string
          channel?: string
          created_at?: string
          created_by?: string
          id?: string
          lead_id?: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruit_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "recruit_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_clicks: {
        Row: {
          clicks: number
          code_lc: string
          day: string
        }
        Insert: {
          clicks?: number
          code_lc: string
          day: string
        }
        Update: {
          clicks?: number
          code_lc?: string
          day?: string
        }
        Relationships: []
      }
      referral_code_checks: {
        Row: {
          checked_at: string
          user_id: string
        }
        Insert: {
          checked_at?: string
          user_id: string
        }
        Update: {
          checked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_code_checks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          code: string
          code_lc: string
          first_seen_at: string
          last_seen_at: string
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          code: string
          code_lc: string
          first_seen_at?: string
          last_seen_at?: string
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          code?: string
          code_lc?: string
          first_seen_at?: string
          last_seen_at?: string
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          code: string
          code_lc: string | null
          recorded_at: string
          source: string
          user_id: string
        }
        Insert: {
          code: string
          code_lc?: string | null
          recorded_at?: string
          source: string
          user_id: string
        }
        Update: {
          code?: string
          code_lc?: string | null
          recorded_at?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      relay_swaps: {
        Row: {
          amount_in: number
          amount_in_wei: string
          amount_out: number | null
          amount_usd: number
          approval_id: string | null
          created_at: string
          deposit_txid: string | null
          direction: string
          error: string | null
          id: string
          link_id: string
          min_out_wei: string
          out_txid: string | null
          parent_id: string | null
          pocket: string
          quoted_out_wei: string | null
          request_id: string | null
          shown_out: number
          slippage_bps: number
          status: string
          step_at: string
          updated_at: string
          user_id: string
          working_until: string | null
        }
        Insert: {
          amount_in: number
          amount_in_wei: string
          amount_out?: number | null
          amount_usd?: number
          approval_id?: string | null
          created_at?: string
          deposit_txid?: string | null
          direction: string
          error?: string | null
          id?: string
          link_id: string
          min_out_wei: string
          out_txid?: string | null
          parent_id?: string | null
          pocket: string
          quoted_out_wei?: string | null
          request_id?: string | null
          shown_out: number
          slippage_bps: number
          status?: string
          step_at?: string
          updated_at?: string
          user_id: string
          working_until?: string | null
        }
        Update: {
          amount_in?: number
          amount_in_wei?: string
          amount_out?: number | null
          amount_usd?: number
          approval_id?: string | null
          created_at?: string
          deposit_txid?: string | null
          direction?: string
          error?: string | null
          id?: string
          link_id?: string
          min_out_wei?: string
          out_txid?: string | null
          parent_id?: string | null
          pocket?: string
          quoted_out_wei?: string | null
          request_id?: string | null
          shown_out?: number
          slippage_bps?: number
          status?: string
          step_at?: string
          updated_at?: string
          user_id?: string
          working_until?: string | null
        }
        Relationships: []
      }
      second_factor_trust: {
        Row: {
          added_at: string
          kind: string
          ref: string
          trusted_at: string | null
          trusted_how: string | null
          user_id: string
        }
        Insert: {
          added_at?: string
          kind: string
          ref: string
          trusted_at?: string | null
          trusted_how?: string | null
          user_id: string
        }
        Update: {
          added_at?: string
          kind?: string
          ref?: string
          trusted_at?: string | null
          trusted_how?: string | null
          user_id?: string
        }
        Relationships: []
      }
      seeds_broadcasts: {
        Row: {
          chain: string
          created_at: string
          txid: string
        }
        Insert: {
          chain: string
          created_at?: string
          txid: string
        }
        Update: {
          chain?: string
          created_at?: string
          txid?: string
        }
        Relationships: []
      }
      send_approvals: {
        Row: {
          amount: number
          asset: string
          created_at: string
          decided_at: string | null
          error: string | null
          expires_at: string
          from_address: string
          id: string
          leg: string
          link_id: string
          meta: Json
          purpose: string
          ref_id: string
          status: string
          telegram_chat_id: string | null
          telegram_message_id: number | null
          to_address: string
          txid: string | null
          used_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          asset: string
          created_at?: string
          decided_at?: string | null
          error?: string | null
          expires_at: string
          from_address: string
          id?: string
          leg: string
          link_id: string
          meta?: Json
          purpose: string
          ref_id: string
          status?: string
          telegram_chat_id?: string | null
          telegram_message_id?: number | null
          to_address: string
          txid?: string | null
          used_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          asset?: string
          created_at?: string
          decided_at?: string | null
          error?: string | null
          expires_at?: string
          from_address?: string
          id?: string
          leg?: string
          link_id?: string
          meta?: Json
          purpose?: string
          ref_id?: string
          status?: string
          telegram_chat_id?: string | null
          telegram_message_id?: number | null
          to_address?: string
          txid?: string | null
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      shared_cache: {
        Row: {
          key: string
          lease_until: string | null
          refreshed_at: string
          value: Json
        }
        Insert: {
          key: string
          lease_until?: string | null
          refreshed_at?: string
          value: Json
        }
        Update: {
          key?: string
          lease_until?: string | null
          refreshed_at?: string
          value?: Json
        }
        Relationships: []
      }
      site_page_views: {
        Row: {
          country: string | null
          created_at: string
          device: string | null
          id: number
          is_new_session: boolean
          path: string
          referrer_host: string | null
          session_id: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          device?: string | null
          id?: number
          is_new_session?: boolean
          path: string
          referrer_host?: string | null
          session_id: string
        }
        Update: {
          country?: string | null
          created_at?: string
          device?: string | null
          id?: number
          is_new_session?: boolean
          path?: string
          referrer_host?: string | null
          session_id?: string
        }
        Relationships: []
      }
      sso_nonces: {
        Row: {
          nonce: string
          used_at: string
        }
        Insert: {
          nonce: string
          used_at?: string
        }
        Update: {
          nonce?: string
          used_at?: string
        }
        Relationships: []
      }
      step_up_checks: {
        Row: {
          browser_secret_hash: string
          code_hash: string | null
          created_at: string
          decided_at: string | null
          expires_at: string
          id: string
          method: string
          purpose: string
          status: string
          telegram_chat_id: string | null
          telegram_message_id: number | null
          tries: number
          used_at: string | null
          user_id: string
        }
        Insert: {
          browser_secret_hash: string
          code_hash?: string | null
          created_at?: string
          decided_at?: string | null
          expires_at: string
          id?: string
          method: string
          purpose: string
          status?: string
          telegram_chat_id?: string | null
          telegram_message_id?: number | null
          tries?: number
          used_at?: string | null
          user_id: string
        }
        Update: {
          browser_secret_hash?: string
          code_hash?: string | null
          created_at?: string
          decided_at?: string | null
          expires_at?: string
          id?: string
          method?: string
          purpose?: string
          status?: string
          telegram_chat_id?: string | null
          telegram_message_id?: number | null
          tries?: number
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      swap_sends: {
        Row: {
          amount_in: number
          amount_usd: number
          approve_txid: string | null
          checked_at: string | null
          created_at: string
          destination: string
          error: string | null
          expected_out: number | null
          from_address: string
          from_asset: string
          id: string
          link_id: string | null
          memo: string
          min_out: number | null
          out_txid: string | null
          parent_id: string | null
          pocket: string
          protocol: string
          router: string | null
          status: string
          to_asset: string
          txid: string | null
          updated_at: string
          user_id: string
          vault: string
        }
        Insert: {
          amount_in: number
          amount_usd: number
          approve_txid?: string | null
          checked_at?: string | null
          created_at?: string
          destination: string
          error?: string | null
          expected_out?: number | null
          from_address: string
          from_asset: string
          id?: string
          link_id?: string | null
          memo: string
          min_out?: number | null
          out_txid?: string | null
          parent_id?: string | null
          pocket: string
          protocol: string
          router?: string | null
          status?: string
          to_asset: string
          txid?: string | null
          updated_at?: string
          user_id: string
          vault: string
        }
        Update: {
          amount_in?: number
          amount_usd?: number
          approve_txid?: string | null
          checked_at?: string | null
          created_at?: string
          destination?: string
          error?: string | null
          expected_out?: number | null
          from_address?: string
          from_asset?: string
          id?: string
          link_id?: string | null
          memo?: string
          min_out?: number | null
          out_txid?: string | null
          parent_id?: string | null
          pocket?: string
          protocol?: string
          router?: string | null
          status?: string
          to_asset?: string
          txid?: string | null
          updated_at?: string
          user_id?: string
          vault?: string
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
      trade_locks: {
        Row: {
          address: string
          chain: string
          created_at: string
          csv_blocks: number
          custody_mode: string
          generation: number
          id: string
          member_pub: string
          pocket_account: number
          seeds_pub: string
          status: string
          updated_at: string
          user_id: string
          witness_script: string
          wrapper: string
        }
        Insert: {
          address: string
          chain: string
          created_at?: string
          csv_blocks: number
          custody_mode: string
          generation?: number
          id?: string
          member_pub: string
          pocket_account: number
          seeds_pub: string
          status?: string
          updated_at?: string
          user_id: string
          witness_script: string
          wrapper: string
        }
        Update: {
          address?: string
          chain?: string
          created_at?: string
          csv_blocks?: number
          custody_mode?: string
          generation?: number
          id?: string
          member_pub?: string
          pocket_account?: number
          seeds_pub?: string
          status?: string
          updated_at?: string
          user_id?: string
          witness_script?: string
          wrapper?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          amount: number
          created_at: string
          expires_at: string
          first_sent_at: string | null
          id: string
          is_demo: boolean
          maker_id: string | null
          maker_order_id: string | null
          pair: string
          price: number
          settle_retry_at: string | null
          settle_started_at: string | null
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
          first_sent_at?: string | null
          id?: string
          is_demo?: boolean
          maker_id?: string | null
          maker_order_id?: string | null
          pair?: string
          price: number
          settle_retry_at?: string | null
          settle_started_at?: string | null
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
          first_sent_at?: string | null
          id?: string
          is_demo?: boolean
          maker_id?: string | null
          maker_order_id?: string | null
          pair?: string
          price?: number
          settle_retry_at?: string | null
          settle_started_at?: string | null
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
      tsd_routes: {
        Row: {
          amount_in: number
          amount_out: number | null
          amount_usd: number
          bridge_deposit: string | null
          bridge_fee_bps: number
          bridge_order_id: string | null
          bridge_out_txid: string | null
          checked_at: string | null
          coin: string
          coin_address: string
          coin_asset: string
          created_at: string
          direction: string
          error: string | null
          evm_address: string
          fresh_out: number | null
          gas_txid: string | null
          id: string
          link_id: string | null
          parent_id: string | null
          protocol: string
          resume_stage: string | null
          shown_out: number
          shown_usdc: number
          stage: string
          step_at: string
          swap_send_id: string | null
          tsd_txid: string | null
          txc_address: string
          updated_at: string
          usdc_amount: number | null
          usdc_txid: string | null
          user_id: string
          working_until: string | null
        }
        Insert: {
          amount_in: number
          amount_out?: number | null
          amount_usd: number
          bridge_deposit?: string | null
          bridge_fee_bps?: number
          bridge_order_id?: string | null
          bridge_out_txid?: string | null
          checked_at?: string | null
          coin: string
          coin_address: string
          coin_asset: string
          created_at?: string
          direction: string
          error?: string | null
          evm_address: string
          fresh_out?: number | null
          gas_txid?: string | null
          id?: string
          link_id?: string | null
          parent_id?: string | null
          protocol?: string
          resume_stage?: string | null
          shown_out: number
          shown_usdc: number
          stage?: string
          step_at?: string
          swap_send_id?: string | null
          tsd_txid?: string | null
          txc_address: string
          updated_at?: string
          usdc_amount?: number | null
          usdc_txid?: string | null
          user_id: string
          working_until?: string | null
        }
        Update: {
          amount_in?: number
          amount_out?: number | null
          amount_usd?: number
          bridge_deposit?: string | null
          bridge_fee_bps?: number
          bridge_order_id?: string | null
          bridge_out_txid?: string | null
          checked_at?: string | null
          coin?: string
          coin_address?: string
          coin_asset?: string
          created_at?: string
          direction?: string
          error?: string | null
          evm_address?: string
          fresh_out?: number | null
          gas_txid?: string | null
          id?: string
          link_id?: string | null
          parent_id?: string | null
          protocol?: string
          resume_stage?: string | null
          shown_out?: number
          shown_usdc?: number
          stage?: string
          step_at?: string
          swap_send_id?: string | null
          tsd_txid?: string | null
          txc_address?: string
          updated_at?: string
          usdc_amount?: number | null
          usdc_txid?: string | null
          user_id?: string
          working_until?: string | null
        }
        Relationships: []
      }
      two_step_swaps: {
        Row: {
          amount_in: number
          amount_out: number | null
          amount_usd: number
          approval_id: string | null
          coin_id: string
          created_at: string
          dex_swap_id: string | null
          direction: string
          error: string | null
          from_address: string
          id: string
          leg2_dex_swap_id: string | null
          leg2_swap_send_id: string | null
          link_id: string
          mid_amount: number | null
          mid_baseline_units: number | null
          mid_id: string
          min_out: number
          network: string
          protocol: string
          shown_mid: number
          shown_out: number
          slippage_bps: number
          status: string
          step_at: string
          swap_send_id: string | null
          symbol_in: string
          symbol_out: string
          to_address: string
          token_address: string
          token_decimals: number
          token_symbol: string
          updated_at: string
          user_id: string
          working_until: string | null
        }
        Insert: {
          amount_in: number
          amount_out?: number | null
          amount_usd?: number
          approval_id?: string | null
          coin_id: string
          created_at?: string
          dex_swap_id?: string | null
          direction: string
          error?: string | null
          from_address: string
          id?: string
          leg2_dex_swap_id?: string | null
          leg2_swap_send_id?: string | null
          link_id: string
          mid_amount?: number | null
          mid_baseline_units?: number | null
          mid_id: string
          min_out: number
          network: string
          protocol: string
          shown_mid: number
          shown_out: number
          slippage_bps: number
          status?: string
          step_at?: string
          swap_send_id?: string | null
          symbol_in: string
          symbol_out: string
          to_address: string
          token_address: string
          token_decimals: number
          token_symbol: string
          updated_at?: string
          user_id: string
          working_until?: string | null
        }
        Update: {
          amount_in?: number
          amount_out?: number | null
          amount_usd?: number
          approval_id?: string | null
          coin_id?: string
          created_at?: string
          dex_swap_id?: string | null
          direction?: string
          error?: string | null
          from_address?: string
          id?: string
          leg2_dex_swap_id?: string | null
          leg2_swap_send_id?: string | null
          link_id?: string
          mid_amount?: number | null
          mid_baseline_units?: number | null
          mid_id?: string
          min_out?: number
          network?: string
          protocol?: string
          shown_mid?: number
          shown_out?: number
          slippage_bps?: number
          status?: string
          step_at?: string
          swap_send_id?: string | null
          symbol_in?: string
          symbol_out?: string
          to_address?: string
          token_address?: string
          token_decimals?: number
          token_symbol?: string
          updated_at?: string
          user_id?: string
          working_until?: string | null
        }
        Relationships: []
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
          spent: number
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
          spent?: number
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
          spent?: number
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
          btc_address: string | null
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
          btc_address?: string | null
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
          btc_address?: string | null
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
      withdrawal_email_codes: {
        Row: {
          attempts: number
          code_digest: string
          created_at: string
          details: string
          expires_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          code_digest: string
          created_at?: string
          details: string
          expires_at: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          code_digest?: string
          created_at?: string
          details?: string
          expires_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      withdrawal_limit_events: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          detail: Json
          id: string
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          detail?: Json
          id?: string
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          detail?: Json
          id?: string
          target_id?: string | null
        }
        Relationships: []
      }
      withdrawal_limit_overrides: {
        Row: {
          frozen: boolean
          note: string
          set_by: string
          tier_level: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          frozen?: boolean
          note: string
          set_by: string
          tier_level?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          frozen?: boolean
          note?: string
          set_by?: string
          tier_level?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      withdrawal_tiers: {
        Row: {
          daily_usd: number
          hold_hours: number
          level: number
          min_account_days: number
          min_trades: number
          min_withdrawals: number
          min_withdrawn_usd: number
          name: string
          per_withdrawal_usd: number
          requires_2fa: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          daily_usd: number
          hold_hours: number
          level: number
          min_account_days?: number
          min_trades?: number
          min_withdrawals?: number
          min_withdrawn_usd?: number
          name: string
          per_withdrawal_usd: number
          requires_2fa?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          daily_usd?: number
          hold_hours?: number
          level?: number
          min_account_days?: number
          min_trades?: number
          min_withdrawals?: number
          min_withdrawn_usd?: number
          name?: string
          per_withdrawal_usd?: number
          requires_2fa?: boolean
          updated_at?: string
          updated_by?: string | null
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
      ad_stat_bump: { Args: { _ad: string; _kind: string }; Returns: undefined }
      admin_account_stats: {
        Args: { _ids: string[] }
        Returns: {
          active_authorizations: number
          authorized_cap: number
          last_activity: string
          open_orders: number
          traded_value: number
          trades: number
          user_id: string
        }[]
      }
      admin_accounts_page: {
        Args: {
          _desc: boolean
          _hits: string[]
          _limit: number
          _offset: number
          _q: string
          _sort: string
        }
        Returns: Json
      }
      admin_affiliates: {
        Args: { _since: string }
        Returns: {
          active_members: number
          clicks_all: number
          clicks_since: number
          code: string
          code_lc: string
          ignite_paid: number
          ignite_started: number
          ignite_usd: number
          link_seen_at: string
          listing_usd: number
          listings_paid: number
          listings_started: number
          owner_id: string
          setup_done: number
          setup_linked: number
          signups_all: number
          signups_since: number
          swap_usd: number
          swaps: number
          traded_value: number
          trades: number
        }[]
      }
      admin_member_activity: {
        Args: { _ids: string[] }
        Returns: {
          last_activity: string
          swap_usd: number
          swaps: number
          traded_value: number
          trades: number
          user_id: string
        }[]
      }
      ai_sync_ingest: { Args: never; Returns: number }
      ai_sync_request: { Args: { _with_markets?: boolean }; Returns: number }
      api_bump_rate: {
        Args: { _key: string; _weight: number; _window: string }
        Returns: number
      }
      approve_pocket_withdrawal: {
        Args: { _approval_id: string; _id: string }
        Returns: boolean
      }
      bump_referral_click: { Args: { _code: string }; Returns: undefined }
      cancel_pocket_withdrawal: {
        Args: { _id: string; _user_id: string }
        Returns: boolean
      }
      claim_listing_promo: {
        Args: { _code: string; _package: string }
        Returns: {
          id: string
          kind: string
          value: number
        }[]
      }
      claim_pocket_spend_lock: {
        Args: { _token: string; _ttl_seconds: number; _user: string }
        Returns: boolean
      }
      claim_pocket_withdrawal: { Args: { _id: string }; Returns: boolean }
      client_errors_prune: { Args: never; Returns: undefined }
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
      legacy_user_for_email: { Args: { _email: string }; Returns: string }
      links_missing_addresses: { Args: { _limit: number }; Returns: string[] }
      market_snapshot_latest: {
        Args: { _max_age_minutes?: number }
        Returns: {
          asset_tor_price: number
          balance_asset: number
          balance_rune: number
          base: string
          bucket: string
          change_pct: number
          derived_depth_bps: number
          high_24h: number
          liquidity: number
          live: boolean
          low_24h: number
          lp_units: number
          name: string
          pending_inbound_asset: number
          pending_inbound_rune: number
          pool: string
          pool_units: number
          price: number
          savers_capacity_remaining: number
          savers_depth: number
          savers_fill_bps: number
          savers_units: number
          slug: string
          spark: number[]
          status: string
          synth_mint_paused: boolean
          synth_supply: number
          synth_supply_remaining: number
          synth_units: number
          trading_halted: boolean
          volume_24h: number
          volume_asset: number
          volume_rune: number
        }[]
      }
      market_snapshots_prune: {
        Args: never
        Returns: {
          hourly_removed: number
          raw_removed: number
        }[]
      }
      market_snapshots_rollup: { Args: never; Returns: number }
      members_due_for_code_check: {
        Args: { _limit: number }
        Returns: {
          hm_member_id: string
          user_id: string
        }[]
      }
      monero_release_lease: { Args: { _holder: string }; Returns: undefined }
      monero_take_lease: {
        Args: { _holder: string; _seconds: number }
        Returns: boolean
      }
      purge_expired_delegations: { Args: never; Returns: number }
      purge_expired_wallet_challenges: { Args: never; Returns: number }
      record_client_error: {
        Args: {
          _account: string
          _browser: string
          _host: string
          _kind: string
          _message: string
          _os: string
          _page: string
          _signature: string
          _source: string
          _version: string
          _viewport: string
        }
        Returns: string
      }
      redeem_legacy_claim: { Args: { _token_hash: string }; Returns: string }
      release_delegation_spend: {
        Args: { _amount: number; _id: string }
        Returns: undefined
      }
      release_listing_promo: { Args: { _id: string }; Returns: undefined }
      release_pocket_spend_lock: {
        Args: { _token: string; _user: string }
        Returns: undefined
      }
      reserve_delegation_spend: {
        Args: {
          _amount: number
          _asset: string
          _chain: string
          _user_id: string
        }
        Returns: string
      }
      reserve_dex_swap: {
        Args: { _daily_max_usd: number; _per_swap_max_usd: number; _row: Json }
        Returns: string
      }
      reserve_gas_topup: {
        Args: {
          _daily_max_usd: number
          _member_daily_max_usd?: number
          _per_route_max_usd: number
          _route_id: string
          _to_address: string
          _usd: number
          _user_id: string
          _wei: number
        }
        Returns: string
      }
      reserve_hype_chain: { Args: { _row: Json }; Returns: string }
      reserve_lock_outpoints: {
        Args: { _spend_ids: string[] }
        Returns: boolean
      }
      reserve_pocket_withdrawal: {
        Args: {
          _amount: number
          _amount_units: string
          _amount_usd: number
          _coin: string
          _daily_max_usd: number
          _from_address: string
          _hold_hours: number
          _link_id: string
          _max_held: number
          _per_max_usd: number
          _to_address: string
          _user_id: string
        }
        Returns: string
      }
      reserve_relay_leg: {
        Args: { _chain_id: string; _row: Json }
        Returns: string
      }
      reserve_relay_swap: {
        Args: { _daily_max_usd: number; _per_swap_max_usd: number; _row: Json }
        Returns: string
      }
      reserve_swap_send: {
        Args: {
          _amount_in: number
          _amount_usd: number
          _daily_max_usd: number
          _destination: string
          _expected_out: number
          _from_address: string
          _from_asset: string
          _link_id: string
          _memo: string
          _min_out: number
          _per_swap_max_usd: number
          _pocket: string
          _protocol: string
          _route_id?: string
          _router: string
          _to_asset: string
          _user_id: string
          _vault: string
        }
        Returns: string
      }
      reserve_tsd_route: {
        Args: {
          _amount_in: number
          _amount_usd: number
          _bridge_fee_bps: number
          _coin: string
          _coin_address: string
          _coin_asset: string
          _daily_max_usd: number
          _direction: string
          _evm_address: string
          _link_id: string
          _parent_id?: string
          _per_swap_max_usd: number
          _protocol: string
          _shown_out: number
          _shown_usdc: number
          _txc_address: string
          _user_id: string
        }
        Returns: string
      }
      reserve_two_step_swap: {
        Args: { _daily_max_usd: number; _per_swap_max_usd: number; _row: Json }
        Returns: string
      }
      reserve_withdrawal: {
        Args: {
          _amount: number
          _amount_units: string
          _amount_usd: number
          _chain: string
          _coin: string
          _daily_max_usd: number
          _from_address: string
          _hold_hours: number
          _link_id: string
          _max_held: number
          _per_max_usd: number
          _to_address: string
          _user_id: string
        }
        Returns: string
      }
      rewrap_pocket_key: {
        Args: { p_link: string; p_new: string; p_old: string }
        Returns: boolean
      }
      save_withdrawal_tiers: {
        Args: { _actor: string; _tiers: Json }
        Returns: string
      }
      set_admin_role: {
        Args: { _actor: string; _grant: boolean; _target: string }
        Returns: string
      }
      set_beta_role: {
        Args: { _actor: string; _grant: boolean; _target: string }
        Returns: string
      }
      set_withdrawal_override: {
        Args: {
          _actor: string
          _clear: boolean
          _frozen: boolean
          _note: string
          _target: string
          _tier: number
        }
        Returns: string
      }
      shared_cache_claim: {
        Args: { _fresh_ms: number; _key: string; _lease_ms: number }
        Returns: boolean
      }
      shared_cache_prune: { Args: never; Returns: number }
      site_page_views_prune: { Args: never; Returns: undefined }
      site_stats_breakdown: {
        Args: { _days?: number; _dimension: string; _limit?: number }
        Returns: {
          label: string
          value: number
        }[]
      }
      site_stats_daily: {
        Args: { _days?: number }
        Returns: {
          day: string
          pageviews: number
          visitors: number
        }[]
      }
      site_stats_totals: {
        Args: { _days?: number }
        Returns: {
          countries: number
          pages: number
          pageviews: number
          visitors: number
        }[]
      }
      swap_send_parent_live: {
        Args: { _route_id: string; _user_id: string }
        Returns: boolean
      }
      use_withdrawal_email_code: {
        Args: { _code_digest: string; _details: string; _user_id: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "user" | "arbitrator" | "admin" | "beta"
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
        | "pls"
        | "hex"
        | "phex"
        | "hype"
        | "avax"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["user", "arbitrator", "admin", "beta"],
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
        "pls",
        "hex",
        "phex",
        "hype",
        "avax",
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
