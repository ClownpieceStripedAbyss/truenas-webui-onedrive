import { Spectator, createComponentFactory, mockProvider } from '@ngneat/spectator/jest';
import { provideMockStore } from '@ngrx/store/testing';
import { UUID } from 'angular2-uuid';
import { of } from 'rxjs';
import { mockAuth } from 'app/core/testing/utils/mock-auth.utils';
import { mockCall, mockWebsocket } from 'app/core/testing/utils/mock-websocket.utils';
import { Preferences } from 'app/interfaces/preferences.interface';
import { ReportComponent } from 'app/pages/reports-dashboard/components/report/report.component';
import { LegendDataWithStackedTotalHtml } from 'app/pages/reports-dashboard/interfaces/report.interface';
import { ReportsService } from 'app/pages/reports-dashboard/reports.service';
import { selectPreferences, selectTheme } from 'app/store/preferences/preferences.selectors';
import { selectTimezone } from 'app/store/system-config/system-config.selectors';

const fakeLegendData = {
  chartId: 'chart-uuid-selected-report',
} as unknown as LegendDataWithStackedTotalHtml;

describe('ReportComponent', () => {
  let spectator: Spectator<ReportComponent>;

  const createComponent = createComponentFactory({
    component: ReportComponent,
    providers: [
      mockWebsocket([
        mockCall('reporting.clear'),
      ]),
      mockProvider(ReportsService, {
        legendEventEmitterObs$: of(fakeLegendData),
      }),
      provideMockStore({
        selectors: [
          {
            selector: selectPreferences,
            value: {
              autoRefreshReports: false,
            } as Preferences,
          },
          {
            selector: selectTimezone,
            value: 'America/New_York',
          },
          {
            selector: selectTheme,
            value: 'ix-dark',
          },
        ],
      }),
      mockAuth(),
    ],
  });

  it('shows legend values only for the target report', () => {
    jest.spyOn(UUID, 'UUID').mockReturnValue('uuid-selected-report');
    spectator = createComponent();
    expect(spectator.component.shouldShowLegendValue).toBeTruthy();
  });

  it('hides legend values for other reports', () => {
    jest.spyOn(UUID, 'UUID').mockReturnValue('uuid-another-report');
    spectator = createComponent();
    expect(spectator.component.shouldShowLegendValue).toBeFalsy();
  });
});
