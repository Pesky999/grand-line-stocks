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
      achievements: {
        Row: {
          category: string
          code: string
          created_at: string
          criteria: Json
          description: string
          icon: string
          id: string
          name: string
          reputation_reward: number
          tier: Database["public"]["Enums"]["achievement_tier"]
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          criteria?: Json
          description: string
          icon?: string
          id?: string
          name: string
          reputation_reward?: number
          tier: Database["public"]["Enums"]["achievement_tier"]
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          criteria?: Json
          description?: string
          icon?: string
          id?: string
          name?: string
          reputation_reward?: number
          tier?: Database["public"]["Enums"]["achievement_tier"]
        }
        Relationships: []
      }
      character_attributes: {
        Row: {
          character_id: string
          hype_rating: number
          investor_confidence: number
          narrative_potential: number
          updated_at: string
          volatility_rating: number
        }
        Insert: {
          character_id: string
          hype_rating?: number
          investor_confidence?: number
          narrative_potential?: number
          updated_at?: string
          volatility_rating?: number
        }
        Update: {
          character_id?: string
          hype_rating?: number
          investor_confidence?: number
          narrative_potential?: number
          updated_at?: string
          volatility_rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "character_attributes_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: true
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      character_pricing_ratings: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          character_id: string
          comparable_adjustment: number
          created_at: string
          created_by: string | null
          current_relevance: number
          future_potential: number
          investor_confidence: number
          launch_catalyst_pct: number
          narrative_importance: number
          popularity: number
          pricing_algorithm_version: string
          ratings_status: string
          stock_category: Database["public"]["Enums"]["stock_category"]
          strength_status: number
          uncertainty_discount_pct: number
          updated_at: string
          updated_by: string | null
          volatility: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          character_id: string
          comparable_adjustment: number
          created_at?: string
          created_by?: string | null
          current_relevance: number
          future_potential: number
          investor_confidence: number
          launch_catalyst_pct: number
          narrative_importance: number
          popularity: number
          pricing_algorithm_version: string
          ratings_status: string
          stock_category: Database["public"]["Enums"]["stock_category"]
          strength_status: number
          uncertainty_discount_pct: number
          updated_at?: string
          updated_by?: string | null
          volatility: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          character_id?: string
          comparable_adjustment?: number
          created_at?: string
          created_by?: string | null
          current_relevance?: number
          future_potential?: number
          investor_confidence?: number
          launch_catalyst_pct?: number
          narrative_importance?: number
          popularity?: number
          pricing_algorithm_version?: string
          ratings_status?: string
          stock_category?: Database["public"]["Enums"]["stock_category"]
          strength_status?: number
          uncertainty_discount_pct?: number
          updated_at?: string
          updated_by?: string | null
          volatility?: number
        }
        Relationships: [
          {
            foreignKeyName: "character_pricing_ratings_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: true
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          bounty: number | null
          category: Database["public"]["Enums"]["stock_category"]
          created_at: string
          crew: string | null
          current_price: number
          description: string | null
          display_order: number | null
          id: string
          image_url: string | null
          momentum: number
          name: string
          previous_price: number
          role: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          bounty?: number | null
          category?: Database["public"]["Enums"]["stock_category"]
          created_at?: string
          crew?: string | null
          current_price?: number
          description?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          momentum?: number
          name: string
          previous_price?: number
          role?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          bounty?: number | null
          category?: Database["public"]["Enums"]["stock_category"]
          created_at?: string
          crew?: string | null
          current_price?: number
          description?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          momentum?: number
          name?: string
          previous_price?: number
          role?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_crew_character_role_scores: {
        Row: {
          character_id: string
          created_at: string
          explanation: string
          mission_id: string
          role: Database["public"]["Enums"]["daily_crew_role"]
          score: number
        }
        Insert: {
          character_id: string
          created_at?: string
          explanation: string
          mission_id: string
          role: Database["public"]["Enums"]["daily_crew_role"]
          score: number
        }
        Update: {
          character_id?: string
          created_at?: string
          explanation?: string
          mission_id?: string
          role?: Database["public"]["Enums"]["daily_crew_role"]
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_crew_character_role_scores_mission_id_character_id_fkey"
            columns: ["mission_id", "character_id"]
            isOneToOne: false
            referencedRelation: "daily_crew_mission_pool"
            referencedColumns: ["mission_id", "character_id"]
          },
          {
            foreignKeyName: "daily_crew_character_role_scores_mission_id_role_fkey"
            columns: ["mission_id", "role"]
            isOneToOne: false
            referencedRelation: "daily_crew_role_requirements"
            referencedColumns: ["mission_id", "role"]
          },
        ]
      }
      daily_crew_mission_pool: {
        Row: {
          character_id: string
          created_at: string
          display_order: number
          id: string
          is_straw_hat: boolean
          mission_id: string
          visible_tags: string[]
        }
        Insert: {
          character_id: string
          created_at?: string
          display_order: number
          id?: string
          is_straw_hat?: boolean
          mission_id: string
          visible_tags?: string[]
        }
        Update: {
          character_id?: string
          created_at?: string
          display_order?: number
          id?: string
          is_straw_hat?: boolean
          mission_id?: string
          visible_tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "daily_crew_mission_pool_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_crew_mission_pool_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "daily_crew_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_crew_missions: {
        Row: {
          brief: string
          created_at: string
          id: string
          max_score: number
          mission_date: string
          mission_tags: string[]
          reveal_at: string | null
          reveal_policy: Database["public"]["Enums"]["daily_crew_reveal_policy"]
          slug: string
          status: Database["public"]["Enums"]["daily_crew_mission_status"]
          title: string
          updated_at: string
        }
        Insert: {
          brief: string
          created_at?: string
          id?: string
          max_score?: number
          mission_date: string
          mission_tags?: string[]
          reveal_at?: string | null
          reveal_policy?: Database["public"]["Enums"]["daily_crew_reveal_policy"]
          slug: string
          status?: Database["public"]["Enums"]["daily_crew_mission_status"]
          title: string
          updated_at?: string
        }
        Update: {
          brief?: string
          created_at?: string
          id?: string
          max_score?: number
          mission_date?: string
          mission_tags?: string[]
          reveal_at?: string | null
          reveal_policy?: Database["public"]["Enums"]["daily_crew_reveal_policy"]
          slug?: string
          status?: Database["public"]["Enums"]["daily_crew_mission_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_crew_perfect_solution: {
        Row: {
          character_id: string
          created_at: string
          mission_id: string
          role: Database["public"]["Enums"]["daily_crew_role"]
        }
        Insert: {
          character_id: string
          created_at?: string
          mission_id: string
          role: Database["public"]["Enums"]["daily_crew_role"]
        }
        Update: {
          character_id?: string
          created_at?: string
          mission_id?: string
          role?: Database["public"]["Enums"]["daily_crew_role"]
        }
        Relationships: [
          {
            foreignKeyName: "daily_crew_perfect_solution_mission_id_character_id_fkey"
            columns: ["mission_id", "character_id"]
            isOneToOne: true
            referencedRelation: "daily_crew_mission_pool"
            referencedColumns: ["mission_id", "character_id"]
          },
          {
            foreignKeyName: "daily_crew_perfect_solution_mission_id_role_fkey"
            columns: ["mission_id", "role"]
            isOneToOne: true
            referencedRelation: "daily_crew_role_requirements"
            referencedColumns: ["mission_id", "role"]
          },
        ]
      }
      daily_crew_role_requirements: {
        Row: {
          created_at: string
          max_points: number
          mission_id: string
          role: Database["public"]["Enums"]["daily_crew_role"]
          subtype_key: string
          subtype_label: string | null
        }
        Insert: {
          created_at?: string
          max_points?: number
          mission_id: string
          role: Database["public"]["Enums"]["daily_crew_role"]
          subtype_key: string
          subtype_label?: string | null
        }
        Update: {
          created_at?: string
          max_points?: number
          mission_id?: string
          role?: Database["public"]["Enums"]["daily_crew_role"]
          subtype_key?: string
          subtype_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_crew_role_requirements_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "daily_crew_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_crew_submission_roles: {
        Row: {
          character_id: string
          created_at: string
          explanation: string
          mission_id: string
          role: Database["public"]["Enums"]["daily_crew_role"]
          role_score: number
          submission_id: string
        }
        Insert: {
          character_id: string
          created_at?: string
          explanation: string
          mission_id: string
          role: Database["public"]["Enums"]["daily_crew_role"]
          role_score: number
          submission_id: string
        }
        Update: {
          character_id?: string
          created_at?: string
          explanation?: string
          mission_id?: string
          role?: Database["public"]["Enums"]["daily_crew_role"]
          role_score?: number
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_crew_submission_roles_mission_id_character_id_fkey"
            columns: ["mission_id", "character_id"]
            isOneToOne: false
            referencedRelation: "daily_crew_mission_pool"
            referencedColumns: ["mission_id", "character_id"]
          },
          {
            foreignKeyName: "daily_crew_submission_roles_mission_id_role_fkey"
            columns: ["mission_id", "role"]
            isOneToOne: false
            referencedRelation: "daily_crew_role_requirements"
            referencedColumns: ["mission_id", "role"]
          },
          {
            foreignKeyName: "daily_crew_submission_roles_submission_id_mission_id_fkey"
            columns: ["submission_id", "mission_id"]
            isOneToOne: false
            referencedRelation: "daily_crew_submissions"
            referencedColumns: ["id", "mission_id"]
          },
        ]
      }
      daily_crew_submissions: {
        Row: {
          created_at: string
          id: string
          mission_id: string
          rank: Database["public"]["Enums"]["daily_crew_rank"]
          reward_amount: number
          reward_paid: boolean
          score: number
          score_breakdown: Json
          submitted_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mission_id: string
          rank: Database["public"]["Enums"]["daily_crew_rank"]
          reward_amount?: number
          reward_paid?: boolean
          score: number
          score_breakdown?: Json
          submitted_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mission_id?: string
          rank?: Database["public"]["Enums"]["daily_crew_rank"]
          reward_amount?: number
          reward_paid?: boolean
          score?: number
          score_breakdown?: Json
          submitted_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_crew_submissions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "daily_crew_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_market_reports: {
        Row: {
          avg_change_pct: number
          biggest_gainer_id: string | null
          biggest_gainer_pct: number | null
          biggest_loser_id: string | null
          biggest_loser_pct: number | null
          created_at: string
          discussed_explanation: string | null
          gainer_explanation: string | null
          headline: string
          id: string
          loser_explanation: string | null
          most_discussed_id: string | null
          report_date: string
          sentiment: Database["public"]["Enums"]["market_sentiment"]
          summary: string
          trending_explanation: string | null
          trending_id: string | null
        }
        Insert: {
          avg_change_pct?: number
          biggest_gainer_id?: string | null
          biggest_gainer_pct?: number | null
          biggest_loser_id?: string | null
          biggest_loser_pct?: number | null
          created_at?: string
          discussed_explanation?: string | null
          gainer_explanation?: string | null
          headline: string
          id?: string
          loser_explanation?: string | null
          most_discussed_id?: string | null
          report_date: string
          sentiment: Database["public"]["Enums"]["market_sentiment"]
          summary: string
          trending_explanation?: string | null
          trending_id?: string | null
        }
        Update: {
          avg_change_pct?: number
          biggest_gainer_id?: string | null
          biggest_gainer_pct?: number | null
          biggest_loser_id?: string | null
          biggest_loser_pct?: number | null
          created_at?: string
          discussed_explanation?: string | null
          gainer_explanation?: string | null
          headline?: string
          id?: string
          loser_explanation?: string | null
          most_discussed_id?: string | null
          report_date?: string
          sentiment?: Database["public"]["Enums"]["market_sentiment"]
          summary?: string
          trending_explanation?: string | null
          trending_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_market_reports_biggest_gainer_id_fkey"
            columns: ["biggest_gainer_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_market_reports_biggest_loser_id_fkey"
            columns: ["biggest_loser_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_market_reports_most_discussed_id_fkey"
            columns: ["most_discussed_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_market_reports_trending_id_fkey"
            columns: ["trending_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      grand_line_guess_attempts: {
        Row: {
          attempt_number: number
          created_at: string
          feedback: Json
          guessed_character_id: string
          id: string
          is_correct: boolean
          puzzle_id: string
          user_id: string
        }
        Insert: {
          attempt_number: number
          created_at?: string
          feedback: Json
          guessed_character_id: string
          id?: string
          is_correct?: boolean
          puzzle_id: string
          user_id: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          feedback?: Json
          guessed_character_id?: string
          id?: string
          is_correct?: boolean
          puzzle_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grand_line_guess_attempts_guessed_character_id_fkey"
            columns: ["guessed_character_id"]
            isOneToOne: false
            referencedRelation: "grand_line_guess_characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grand_line_guess_attempts_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "grand_line_guess_daily_puzzles"
            referencedColumns: ["id"]
          },
        ]
      }
      grand_line_guess_characters: {
        Row: {
          active: boolean
          affiliation: string | null
          affiliation_category: string | null
          bounty_display: string | null
          bounty_is_minimum: boolean
          bounty_numeric: number | null
          bounty_unknown: boolean
          created_at: string
          daily_eligible: boolean
          data_quality_flags: Json
          devil_fruit_display: string | null
          devil_fruit_name: string | null
          first_arc: string | null
          first_arc_order: number | null
          gender: string | null
          haki_raw: string | null
          has_armament: boolean
          has_conquerors: boolean
          has_devil_fruit: boolean
          has_observation: boolean
          height_cm: number | null
          height_unknown: boolean
          id: string
          name: string
          practice_eligible: boolean
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          affiliation?: string | null
          affiliation_category?: string | null
          bounty_display?: string | null
          bounty_is_minimum?: boolean
          bounty_numeric?: number | null
          bounty_unknown?: boolean
          created_at?: string
          daily_eligible?: boolean
          data_quality_flags?: Json
          devil_fruit_display?: string | null
          devil_fruit_name?: string | null
          first_arc?: string | null
          first_arc_order?: number | null
          gender?: string | null
          haki_raw?: string | null
          has_armament?: boolean
          has_conquerors?: boolean
          has_devil_fruit?: boolean
          has_observation?: boolean
          height_cm?: number | null
          height_unknown?: boolean
          id?: string
          name: string
          practice_eligible?: boolean
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          affiliation?: string | null
          affiliation_category?: string | null
          bounty_display?: string | null
          bounty_is_minimum?: boolean
          bounty_numeric?: number | null
          bounty_unknown?: boolean
          created_at?: string
          daily_eligible?: boolean
          data_quality_flags?: Json
          devil_fruit_display?: string | null
          devil_fruit_name?: string | null
          first_arc?: string | null
          first_arc_order?: number | null
          gender?: string | null
          haki_raw?: string | null
          has_armament?: boolean
          has_conquerors?: boolean
          has_devil_fruit?: boolean
          has_observation?: boolean
          height_cm?: number | null
          height_unknown?: boolean
          id?: string
          name?: string
          practice_eligible?: boolean
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      grand_line_guess_daily_puzzles: {
        Row: {
          character_id: string
          created_at: string
          id: string
          puzzle_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          character_id: string
          created_at?: string
          id?: string
          puzzle_date: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          character_id?: string
          created_at?: string
          id?: string
          puzzle_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grand_line_guess_daily_puzzles_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "grand_line_guess_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      grand_line_guess_results: {
        Row: {
          attempts_used: number
          created_at: string
          hints_used: number
          id: string
          puzzle_id: string
          reward_amount: number
          reward_paid: boolean
          solved: boolean
          solved_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts_used?: number
          created_at?: string
          hints_used?: number
          id?: string
          puzzle_id: string
          reward_amount?: number
          reward_paid?: boolean
          solved?: boolean
          solved_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts_used?: number
          created_at?: string
          hints_used?: number
          id?: string
          puzzle_id?: string
          reward_amount?: number
          reward_paid?: boolean
          solved?: boolean
          solved_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grand_line_guess_results_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "grand_line_guess_daily_puzzles"
            referencedColumns: ["id"]
          },
        ]
      }
      grand_line_guess_stats: {
        Row: {
          average_attempts: number
          best_streak: number
          current_streak: number
          games_played: number
          games_won: number
          last_played_date: string | null
          last_win_date: string | null
          one_shot_wins: number
          total_rewards_earned: number
          updated_at: string
          user_id: string
        }
        Insert: {
          average_attempts?: number
          best_streak?: number
          current_streak?: number
          games_played?: number
          games_won?: number
          last_played_date?: string | null
          last_win_date?: string | null
          one_shot_wins?: number
          total_rewards_earned?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          average_attempts?: number
          best_streak?: number
          current_streak?: number
          games_played?: number
          games_won?: number
          last_played_date?: string | null
          last_win_date?: string | null
          one_shot_wins?: number
          total_rewards_earned?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      hype_modifier_targets: {
        Row: {
          character_id: string
          id: string
          modifier_id: string
        }
        Insert: {
          character_id: string
          id?: string
          modifier_id: string
        }
        Update: {
          character_id?: string
          id?: string
          modifier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hype_modifier_targets_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hype_modifier_targets_modifier_id_fkey"
            columns: ["modifier_id"]
            isOneToOne: false
            referencedRelation: "hype_modifiers"
            referencedColumns: ["id"]
          },
        ]
      }
      hype_modifiers: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          modifier_type: Database["public"]["Enums"]["hype_modifier_type"]
          multiplier: number
          starts_at: string
          title: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          modifier_type: Database["public"]["Enums"]["hype_modifier_type"]
          multiplier?: number
          starts_at?: string
          title: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          modifier_type?: Database["public"]["Enums"]["hype_modifier_type"]
          multiplier?: number
          starts_at?: string
          title?: string
        }
        Relationships: []
      }
      leaderboard_cache: {
        Row: {
          board_key: string
          id: number
          meta: Json
          prev_rank: number | null
          rank: number
          refreshed_at: string
          user_id: string
          value: number
        }
        Insert: {
          board_key: string
          id?: number
          meta?: Json
          prev_rank?: number | null
          rank: number
          refreshed_at?: string
          user_id: string
          value: number
        }
        Update: {
          board_key?: string
          id?: number
          meta?: Json
          prev_rank?: number | null
          rank?: number
          refreshed_at?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      legacy_records: {
        Row: {
          achieved_at: string
          character_id: string | null
          code: string
          description: string
          id: string
          title: string
          user_id: string | null
          value: number | null
        }
        Insert: {
          achieved_at?: string
          character_id?: string | null
          code: string
          description: string
          id?: string
          title: string
          user_id?: string | null
          value?: number | null
        }
        Update: {
          achieved_at?: string
          character_id?: string | null
          code?: string
          description?: string
          id?: string
          title?: string
          user_id?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "legacy_records_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
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
      market_rumor_impacts: {
        Row: {
          character_id: string
          created_at: string
          id: string
          pct_change: number
          price_after: number | null
          price_before: number | null
          rumor_id: string
        }
        Insert: {
          character_id: string
          created_at?: string
          id?: string
          pct_change: number
          price_after?: number | null
          price_before?: number | null
          rumor_id: string
        }
        Update: {
          character_id?: string
          created_at?: string
          id?: string
          pct_change?: number
          price_after?: number | null
          price_before?: number | null
          rumor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_rumor_impacts_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_rumor_impacts_rumor_id_fkey"
            columns: ["rumor_id"]
            isOneToOne: false
            referencedRelation: "market_rumors"
            referencedColumns: ["id"]
          },
        ]
      }
      market_rumors: {
        Row: {
          created_at: string
          description: string
          expires_at: string | null
          id: string
          status: Database["public"]["Enums"]["rumor_status"]
          title: string
        }
        Insert: {
          created_at?: string
          description: string
          expires_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["rumor_status"]
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          expires_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["rumor_status"]
          title?: string
        }
        Relationships: []
      }
      net_worth_snapshots: {
        Row: {
          cash: number
          created_at: string
          equity: number
          id: string
          net_worth: number
          rank_overall: number | null
          return_pct: number
          snapshot_date: string
          user_id: string
        }
        Insert: {
          cash?: number
          created_at?: string
          equity?: number
          id?: string
          net_worth?: number
          rank_overall?: number | null
          return_pct?: number
          snapshot_date: string
          user_id: string
        }
        Update: {
          cash?: number
          created_at?: string
          equity?: number
          id?: string
          net_worth?: number
          rank_overall?: number | null
          return_pct?: number
          snapshot_date?: string
          user_id?: string
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
          source: string | null
          source_event_id: string | null
          source_rumor_id: string | null
        }
        Insert: {
          character_id: string
          created_at?: string
          id?: string
          note?: string | null
          pct_change?: number | null
          price: number
          source?: string | null
          source_event_id?: string | null
          source_rumor_id?: string | null
        }
        Update: {
          character_id?: string
          created_at?: string
          id?: string
          note?: string | null
          pct_change?: number | null
          price?: number
          source?: string | null
          source_event_id?: string | null
          source_rumor_id?: string | null
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
      price_movement_explanations: {
        Row: {
          character_id: string
          created_at: string
          factors: Json
          id: string
          pct_change: number
          price_after: number | null
          price_before: number | null
          price_history_id: string | null
          reason_codes: Database["public"]["Enums"]["movement_reason_code"][]
          source: string
          source_ref_id: string | null
          summary: string
        }
        Insert: {
          character_id: string
          created_at?: string
          factors?: Json
          id?: string
          pct_change: number
          price_after?: number | null
          price_before?: number | null
          price_history_id?: string | null
          reason_codes?: Database["public"]["Enums"]["movement_reason_code"][]
          source: string
          source_ref_id?: string | null
          summary: string
        }
        Update: {
          character_id?: string
          created_at?: string
          factors?: Json
          id?: string
          pct_change?: number
          price_after?: number | null
          price_before?: number | null
          price_history_id?: string | null
          reason_codes?: Database["public"]["Enums"]["movement_reason_code"][]
          source?: string
          source_ref_id?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_movement_explanations_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_movement_explanations_price_history_id_fkey"
            columns: ["price_history_id"]
            isOneToOne: false
            referencedRelation: "price_history"
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
      user_achievements: {
        Row: {
          achievement_id: string
          id: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          id?: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          id?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
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
      user_stats: {
        Row: {
          avg_holding_days: number
          best_trade_pnl: number
          best_trade_slug: string | null
          current_net_worth: number
          current_rank: number | null
          days_active: number
          highest_net_worth: number
          highest_rank: number | null
          largest_position_slug: string | null
          largest_position_value: number
          last_active_date: string
          login_streak: number
          losses: number
          rank_overall_prev: number | null
          realized_pnl: number
          reputation_score: number
          specialization: Database["public"]["Enums"]["investor_specialization"]
          title: Database["public"]["Enums"]["investor_title"]
          total_buys: number
          total_sells: number
          total_trades: number
          total_volume: number
          updated_at: string
          user_id: string
          wins: number
          worst_trade_pnl: number
          worst_trade_slug: string | null
        }
        Insert: {
          avg_holding_days?: number
          best_trade_pnl?: number
          best_trade_slug?: string | null
          current_net_worth?: number
          current_rank?: number | null
          days_active?: number
          highest_net_worth?: number
          highest_rank?: number | null
          largest_position_slug?: string | null
          largest_position_value?: number
          last_active_date?: string
          login_streak?: number
          losses?: number
          rank_overall_prev?: number | null
          realized_pnl?: number
          reputation_score?: number
          specialization?: Database["public"]["Enums"]["investor_specialization"]
          title?: Database["public"]["Enums"]["investor_title"]
          total_buys?: number
          total_sells?: number
          total_trades?: number
          total_volume?: number
          updated_at?: string
          user_id: string
          wins?: number
          worst_trade_pnl?: number
          worst_trade_slug?: string | null
        }
        Update: {
          avg_holding_days?: number
          best_trade_pnl?: number
          best_trade_slug?: string | null
          current_net_worth?: number
          current_rank?: number | null
          days_active?: number
          highest_net_worth?: number
          highest_rank?: number | null
          largest_position_slug?: string | null
          largest_position_value?: number
          last_active_date?: string
          login_streak?: number
          losses?: number
          rank_overall_prev?: number | null
          realized_pnl?: number
          reputation_score?: number
          specialization?: Database["public"]["Enums"]["investor_specialization"]
          title?: Database["public"]["Enums"]["investor_title"]
          total_buys?: number
          total_sells?: number
          total_trades?: number
          total_volume?: number
          updated_at?: string
          user_id?: string
          wins?: number
          worst_trade_pnl?: number
          worst_trade_slug?: string | null
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
      approve_character_pricing_ratings: {
        Args: {
          _character_id: string
          _expected_pricing_algorithm_version: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          character_id: string
          comparable_adjustment: number
          created_at: string
          created_by: string | null
          current_relevance: number
          future_potential: number
          investor_confidence: number
          launch_catalyst_pct: number
          narrative_importance: number
          popularity: number
          pricing_algorithm_version: string
          ratings_status: string
          stock_category: Database["public"]["Enums"]["stock_category"]
          strength_status: number
          uncertainty_discount_pct: number
          updated_at: string
          updated_by: string | null
          volatility: number
        }
        SetofOptions: {
          from: "*"
          to: "character_pricing_ratings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      award_grand_line_guess_reward: {
        Args: {
          _attempt_number: number
          _puzzle_id: string
          _reward_amount: number
          _user_id: string
        }
        Returns: boolean
      }
      check_achievements: { Args: { _user_id: string }; Returns: number }
      check_legacy_for_user: { Args: { _user_id: string }; Returns: undefined }
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
      execute_trade_authenticated: {
        Args: { _shares: number; _side: string; _slug: string }
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
      expire_old_rumors: { Args: never; Returns: number }
      generate_market_rumor: {
        Args: never
        Returns: {
          created_at: string
          description: string
          expires_at: string | null
          id: string
          status: Database["public"]["Enums"]["rumor_status"]
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "market_rumors"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_movement_explanation: {
        Args: {
          _character_id: string
          _pct_change: number
          _price_history_id?: string
          _source?: string
          _source_ref_id?: string
          _threshold?: number
        }
        Returns: {
          character_id: string
          created_at: string
          factors: Json
          id: string
          pct_change: number
          price_after: number | null
          price_before: number | null
          price_history_id: string | null
          reason_codes: Database["public"]["Enums"]["movement_reason_code"][]
          source: string
          source_ref_id: string | null
          summary: string
        }
        SetofOptions: {
          from: "*"
          to: "price_movement_explanations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_public_character_top_holders: {
        Args: { _limit?: number; _offset?: number; _slug: string }
        Returns: {
          display_name: string
          rank: number
          shares: number
          username: string
          value: number
        }[]
      }
      get_public_leaderboard: {
        Args: { _board_key: string; _limit?: number; _offset?: number }
        Returns: {
          display_name: string
          prev_rank: number
          rank: number
          title: Database["public"]["Enums"]["investor_title"]
          username: string
          value: number
        }[]
      }
      get_public_leaderboard_movers: {
        Args: { _limit?: number }
        Returns: {
          delta: number
          direction: string
          rank: number
          username: string
        }[]
      }
      get_public_legacy_records: {
        Args: { _limit?: number; _offset?: number; _username?: string }
        Returns: {
          achieved_at: string
          code: string
          description: string
          display_name: string
          title: string
          username: string
          value: number
        }[]
      }
      grant_achievement: {
        Args: { _code: string; _user_id: string }
        Returns: boolean
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
      recalc_user_stats: {
        Args: { _user_id: string }
        Returns: {
          avg_holding_days: number
          best_trade_pnl: number
          best_trade_slug: string | null
          current_net_worth: number
          current_rank: number | null
          days_active: number
          highest_net_worth: number
          highest_rank: number | null
          largest_position_slug: string | null
          largest_position_value: number
          last_active_date: string
          login_streak: number
          losses: number
          rank_overall_prev: number | null
          realized_pnl: number
          reputation_score: number
          specialization: Database["public"]["Enums"]["investor_specialization"]
          title: Database["public"]["Enums"]["investor_title"]
          total_buys: number
          total_sells: number
          total_trades: number
          total_volume: number
          updated_at: string
          user_id: string
          wins: number
          worst_trade_pnl: number
          worst_trade_slug: string | null
        }
        SetofOptions: {
          from: "*"
          to: "user_stats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_legacy_if_first: {
        Args: {
          _character_id: string
          _code: string
          _description: string
          _title: string
          _user_id: string
          _value: number
        }
        Returns: undefined
      }
      refresh_leaderboards: { Args: never; Returns: undefined }
      reset_character_pricing_ratings: {
        Args: { _character_id: string }
        Returns: boolean
      }
      run_daily_market_cycle: {
        Args: never
        Returns: {
          avg_change_pct: number
          biggest_gainer_id: string | null
          biggest_gainer_pct: number | null
          biggest_loser_id: string | null
          biggest_loser_pct: number | null
          created_at: string
          discussed_explanation: string | null
          gainer_explanation: string | null
          headline: string
          id: string
          loser_explanation: string | null
          most_discussed_id: string | null
          report_date: string
          sentiment: Database["public"]["Enums"]["market_sentiment"]
          summary: string
          trending_explanation: string | null
          trending_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "daily_market_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_and_apply_character_pricing: {
        Args: {
          _character_id: string
          _comparable_adjustment: number
          _current_relevance: number
          _future_potential: number
          _investor_confidence: number
          _launch_catalyst_pct: number
          _narrative_importance: number
          _popularity: number
          _pricing_algorithm_version: string
          _stock_category: Database["public"]["Enums"]["stock_category"]
          _strength_status: number
          _uncertainty_discount_pct: number
          _volatility: number
        }
        Returns: Json
      }
      save_character_pricing_draft: {
        Args: {
          _character_id: string
          _comparable_adjustment: number
          _current_relevance: number
          _future_potential: number
          _investor_confidence: number
          _launch_catalyst_pct: number
          _narrative_importance: number
          _popularity: number
          _pricing_algorithm_version: string
          _stock_category: Database["public"]["Enums"]["stock_category"]
          _strength_status: number
          _uncertainty_discount_pct: number
          _volatility: number
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          character_id: string
          comparable_adjustment: number
          created_at: string
          created_by: string | null
          current_relevance: number
          future_potential: number
          investor_confidence: number
          launch_catalyst_pct: number
          narrative_importance: number
          popularity: number
          pricing_algorithm_version: string
          ratings_status: string
          stock_category: Database["public"]["Enums"]["stock_category"]
          strength_status: number
          uncertainty_discount_pct: number
          updated_at: string
          updated_by: string | null
          volatility: number
        }
        SetofOptions: {
          from: "*"
          to: "character_pricing_ratings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_trivia_answer: {
        Args: { _choice_index: number; _question_id: string }
        Returns: {
          already_answered: boolean
          correct: boolean
          reward: number
        }[]
      }
      user_equity: { Args: { _user_id: string }; Returns: number }
      validate_daily_crew_mission: {
        Args: { _mission_id: string }
        Returns: boolean
      }
    }
    Enums: {
      achievement_tier: "beginner" | "intermediate" | "advanced" | "legendary"
      app_role: "admin" | "moderator" | "user"
      daily_crew_mission_status:
        | "draft"
        | "scheduled"
        | "published"
        | "archived"
      daily_crew_rank: "s" | "a" | "b" | "c" | "fail"
      daily_crew_reveal_policy: "immediate" | "next_day" | "manual"
      daily_crew_role:
        | "captain"
        | "fighter"
        | "navigator"
        | "strategist"
        | "support"
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
      hype_modifier_type:
        | "movie_announcement"
        | "anime_announcement"
        | "trailer_release"
        | "game_release"
        | "merchandise"
        | "live_action"
        | "other"
      investor_specialization:
        | "generalist"
        | "value_investor"
        | "growth_investor"
        | "speculator"
        | "meme_investor"
        | "event_trader"
        | "whale"
      investor_title:
        | "rookie_pirate"
        | "east_blue_trader"
        | "grand_line_investor"
        | "warlord_investor"
        | "yonko_investor"
        | "pirate_king_investor"
      market_sentiment:
        | "extremely_bearish"
        | "bearish"
        | "neutral"
        | "bullish"
        | "extremely_bullish"
      movement_reason_code:
        | "story_momentum"
        | "speculation"
        | "investor_optimism"
        | "investor_fear"
        | "market_correction"
        | "hype_surge"
        | "meme_activity"
        | "whale_buying"
        | "whale_selling"
        | "event_reaction"
        | "long_term_growth"
        | "normal_volatility"
      rumor_status: "active" | "expired"
      stock_category: "blue_chip" | "growth" | "speculative" | "meme"
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
      achievement_tier: ["beginner", "intermediate", "advanced", "legendary"],
      app_role: ["admin", "moderator", "user"],
      daily_crew_mission_status: [
        "draft",
        "scheduled",
        "published",
        "archived",
      ],
      daily_crew_rank: ["s", "a", "b", "c", "fail"],
      daily_crew_reveal_policy: ["immediate", "next_day", "manual"],
      daily_crew_role: [
        "captain",
        "fighter",
        "navigator",
        "strategist",
        "support",
      ],
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
      hype_modifier_type: [
        "movie_announcement",
        "anime_announcement",
        "trailer_release",
        "game_release",
        "merchandise",
        "live_action",
        "other",
      ],
      investor_specialization: [
        "generalist",
        "value_investor",
        "growth_investor",
        "speculator",
        "meme_investor",
        "event_trader",
        "whale",
      ],
      investor_title: [
        "rookie_pirate",
        "east_blue_trader",
        "grand_line_investor",
        "warlord_investor",
        "yonko_investor",
        "pirate_king_investor",
      ],
      market_sentiment: [
        "extremely_bearish",
        "bearish",
        "neutral",
        "bullish",
        "extremely_bullish",
      ],
      movement_reason_code: [
        "story_momentum",
        "speculation",
        "investor_optimism",
        "investor_fear",
        "market_correction",
        "hype_surge",
        "meme_activity",
        "whale_buying",
        "whale_selling",
        "event_reaction",
        "long_term_growth",
        "normal_volatility",
      ],
      rumor_status: ["active", "expired"],
      stock_category: ["blue_chip", "growth", "speculative", "meme"],
    },
  },
} as const
