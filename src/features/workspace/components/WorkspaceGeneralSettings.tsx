import React from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/shared/ui/command';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { Block } from '@/features/workspace/components/settingsBlocks';
import type { WorkspaceGeneralDraft } from '@/features/workspace/hooks/useWorkspaceGeneralDraft';

interface WorkspaceGeneralSettingsProps {
  draft: WorkspaceGeneralDraft;
  isAdmin: boolean;
  currentWorkspaceId: string | null;
}

/** Settings → General: the workspace name and its holiday calendar. */
export const WorkspaceGeneralSettings: React.FC<WorkspaceGeneralSettingsProps> = ({
  draft,
  isAdmin,
  currentWorkspaceId,
}) => {
  const {
    filteredHolidayCountryOptions,
    handleSaveWorkspaceHolidayCountry,
    handleSaveWorkspaceName,
    holidayCalendarUnchanged,
    holidayCountryLabel,
    holidayCountryLoading,
    holidayCountryOpen,
    holidayCountryQuery,
    holidayRegionLoading,
    holidayRegionOpen,
    holidayRegionOptions,
    regionHolidayList,
    selectedHolidayRegion,
    setHolidayCountryOpen,
    setHolidayCountryQuery,
    setHolidayRegionOpen,
    setWorkspaceHolidayCountry,
    setWorkspaceHolidayRegion,
    setWorkspaceName,
    workspaceError,
    workspaceHolidayCountry,
    workspaceHolidayRegion,
    workspaceName,
    workspaceSaving,
  } = draft;

  return (
    <div className="space-y-5">
      {!isAdmin && (
        <Block title={t`Access`}>
          <p className="text-sm text-muted-foreground">
            {t`You have view access and cannot edit this workspace.`}
          </p>
        </Block>
      )}

      <Block title={t`Workspace name`}>
        <div className="space-y-2">
          <Input
            id="workspace-name"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            disabled={!isAdmin || !currentWorkspaceId || workspaceSaving}
          />
          {workspaceError && (
            <div className="text-sm text-destructive">{workspaceError}</div>
          )}
          <Button
            onClick={handleSaveWorkspaceName}
            disabled={!isAdmin || !currentWorkspaceId || workspaceSaving || !workspaceName.trim()}
          >
            {t`Save`}
          </Button>
        </div>
      </Block>

      <Block title={t`Holiday calendar`}>
        <div className="space-y-2">
          <Label htmlFor="workspace-holiday-country">{t`Country code`}</Label>
          <Popover
            open={holidayCountryOpen}
            onOpenChange={(nextOpen) => {
              setHolidayCountryOpen(nextOpen);
              if (!nextOpen) {
                setHolidayCountryQuery('');
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button
                id="workspace-holiday-country"
                type="button"
                variant="outline"
                role="combobox"
                className="w-full justify-between"
                disabled={!isAdmin || !currentWorkspaceId || workspaceSaving}
              >
                <span className="truncate">{holidayCountryLabel}</span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" side="bottom">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder={t`Search countries...`}
                  value={holidayCountryQuery}
                  onValueChange={setHolidayCountryQuery}
                />
                <CommandList>
                  <CommandEmpty>
                    {holidayCountryLoading ? t`Loading available countries...` : t`No countries found.`}
                  </CommandEmpty>
                  <CommandGroup>
                    {filteredHolidayCountryOptions.map((option) => {
                      const isSelected = option.countryCode === workspaceHolidayCountry;
                      return (
                        <CommandItem
                          key={option.countryCode}
                          onSelect={() => {
                            if (option.countryCode !== workspaceHolidayCountry) {
                              // A region belongs to its country.
                              setWorkspaceHolidayRegion(null);
                            }
                            setWorkspaceHolidayCountry(option.countryCode);
                            setHolidayCountryOpen(false);
                            setHolidayCountryQuery('');
                          }}
                        >
                          <Check className={cn('mr-2 h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                          <span className="truncate">{option.name}</span>
                          <span className="ml-auto text-xs text-muted-foreground">{option.countryCode}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <p className="text-xs text-muted-foreground">
            {holidayCountryLoading
              ? t`Loading available countries...`
              : t`Use ISO code (for example RU, US, DE).`}
          </p>
          {(holidayRegionOptions.length > 0 || workspaceHolidayRegion) && (
            <div className="space-y-2 pt-2">
              <Label htmlFor="workspace-holiday-region">{t`Region`}</Label>
              <Popover open={holidayRegionOpen} onOpenChange={setHolidayRegionOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="workspace-holiday-region"
                    type="button"
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between"
                    disabled={!isAdmin || !currentWorkspaceId || workspaceSaving}
                  >
                    <span className="truncate">
                      {workspaceHolidayRegion
                        ? (selectedHolidayRegion?.name ?? workspaceHolidayRegion)
                        : t`Whole country`}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" side="bottom">
                  <Command>
                    <CommandInput placeholder={t`Search regions...`} />
                    <CommandList>
                      <CommandEmpty>
                        {holidayRegionLoading ? t`Loading regions...` : t`No regions found.`}
                      </CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value={t`Whole country`}
                          onSelect={() => {
                            setWorkspaceHolidayRegion(null);
                            setHolidayRegionOpen(false);
                          }}
                        >
                          <Check className={cn('mr-2 h-4 w-4', workspaceHolidayRegion ? 'opacity-0' : 'opacity-100')} />
                          <span className="truncate">{t`Whole country`}</span>
                        </CommandItem>
                        {holidayRegionOptions.map((option) => (
                          <CommandItem
                            key={option.code}
                            value={`${option.name} ${option.code}`}
                            onSelect={() => {
                              setWorkspaceHolidayRegion(option.code);
                              setHolidayRegionOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                option.code === workspaceHolidayRegion ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                            <span className="truncate">{option.name}</span>
                            <span className="ml-auto text-xs text-muted-foreground">{option.code}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                {regionHolidayList
                  ? t`Also counts: ${regionHolidayList}.`
                  : t`Only holidays of the whole country count. Pick a region to add its own holidays.`}
              </p>
            </div>
          )}
          {workspaceError && (
            <div className="text-sm text-destructive">{workspaceError}</div>
          )}
          <Button
            onClick={handleSaveWorkspaceHolidayCountry}
            disabled={
              !isAdmin
              || !currentWorkspaceId
              || workspaceSaving
              || !workspaceHolidayCountry.trim()
              || holidayCalendarUnchanged
            }
          >
            {t`Save`}
          </Button>
        </div>
      </Block>
    </div>
  );
};
