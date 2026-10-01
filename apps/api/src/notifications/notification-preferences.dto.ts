import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsOptional() @IsBoolean() taskAssigned?: boolean;
  @IsOptional() @IsBoolean() taskReassigned?: boolean;
  @IsOptional() @IsBoolean() taskStatusChanged?: boolean;
  @IsOptional() @IsBoolean() taskPriorityChanged?: boolean;
  @IsOptional() @IsBoolean() taskCompleted?: boolean;
  @IsOptional() @IsBoolean() taskReopened?: boolean;
  @IsOptional() @IsBoolean() taskDueToday?: boolean;
  @IsOptional() @IsBoolean() taskDueTomorrow?: boolean;
  @IsOptional() @IsBoolean() taskOverdue?: boolean;
  @IsOptional() @IsBoolean() taskComment?: boolean;
  @IsOptional() @IsBoolean() taskMention?: boolean;
  @IsOptional() @IsBoolean() workspaceActivity?: boolean;
  @IsOptional() @IsBoolean() dailyAiBrief?: boolean;
  @IsOptional() @IsBoolean() dailyDigest?: boolean;
  @IsOptional() @IsBoolean() emailTaskAssigned?: boolean;
  @IsOptional() @IsBoolean() emailTaskReassigned?: boolean;
  @IsOptional() @IsBoolean() emailTaskDueToday?: boolean;
  @IsOptional() @IsBoolean() emailTaskDueTomorrow?: boolean;
  @IsOptional() @IsBoolean() emailTaskOverdue?: boolean;
  @IsOptional() @IsBoolean() emailTaskComment?: boolean;
  @IsOptional() @IsBoolean() emailTaskMention?: boolean;
  @IsOptional() @IsBoolean() emailTaskStatusChanged?: boolean;
  @IsOptional() @IsBoolean() emailTaskPriorityChanged?: boolean;
  @IsOptional() @IsBoolean() emailDailySummary?: boolean;
}
