import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { UntilDestroy } from '@ngneat/until-destroy';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { EMPTY, merge, Observable } from 'rxjs';
import {
  filter, map, mergeMap, switchMap, tap, withLatestFrom,
} from 'rxjs/operators';
import { FailoverDisabledReason } from 'app/enums/failover-disabled-reason.enum';
import { Role } from 'app/enums/role.enum';
import { filterAsync } from 'app/helpers/operators/filter-async.operator';
import { EntityJobComponent } from 'app/modules/entity/entity-job/entity-job.component';
import { AuthService } from 'app/services/auth/auth.service';
import { DialogService } from 'app/services/dialog.service';
import { WebSocketService } from 'app/services/ws.service';
import { haStatusLoaded } from 'app/store/ha-info/ha-info.actions';
import { selectIsHaLicensed } from 'app/store/ha-info/ha-info.selectors';
import {
  failoverUpgradeFinished,
  updatePendingIndicatorPressed,
  upgradePendingStateLoaded,
} from 'app/store/ha-upgrade/ha-upgrade.actions';
import { AppState } from 'app/store/index';

@UntilDestroy()
@Injectable()
export class HaUpgradeEffects {
  checkIfRemoteUpgradeIsRequired$ = createEffect(() => this.actions$.pipe(
    ofType(haStatusLoaded),
    withLatestFrom(this.store$.select(selectIsHaLicensed)),
    mergeMap(([{ haStatus }, isHa]) => {
      const shouldCheckForPendingUpgrade = (haStatus.hasHa && haStatus.reasons.length === 0)
        || (haStatus.reasons.length === 1 && haStatus.reasons[0] === FailoverDisabledReason.MismatchVersions);

      if (!isHa || !shouldCheckForPendingUpgrade) {
        return EMPTY;
      }

      return this.ws.call('failover.upgrade_pending').pipe(
        map((isUpgradePending) => upgradePendingStateLoaded({ isUpgradePending })),
      );
    }),
  ));

  showUpgradePendingDialog$ = createEffect(() => merge(
    this.actions$.pipe(
      ofType(upgradePendingStateLoaded),
      filter(({ isUpgradePending }) => isUpgradePending),
      filterAsync(() => this.authService.hasRole([Role.FailoverWrite])),
    ),
    this.actions$.pipe(ofType(updatePendingIndicatorPressed)),
  ).pipe(
    switchMap(() => {
      return this.dialogService.confirm({
        title: this.translate.instant('Pending Upgrade'),
        message: this.translate.instant('There is an upgrade waiting to finish.'),
        hideCheckbox: true,
        buttonText: this.translate.instant('Continue'),
      });
    }),
    filter(Boolean),
    switchMap(() => this.finishUpgrade()),
    map(() => failoverUpgradeFinished()),
  ));

  constructor(
    private actions$: Actions,
    private ws: WebSocketService,
    private store$: Store<AppState>,
    private dialogService: DialogService,
    private translate: TranslateService,
    private matDialog: MatDialog,
    private authService: AuthService,
  ) { }

  private finishUpgrade(): Observable<unknown> {
    const dialogRef = this.matDialog.open(EntityJobComponent, { data: { title: this.translate.instant('Update') } });
    dialogRef.componentInstance.setCall('failover.upgrade_finish');
    dialogRef.componentInstance.disableProgressValue(true);
    dialogRef.componentInstance.submit();
    return dialogRef.componentInstance.success.pipe(
      tap(() => dialogRef.close(false)),
    );
  }
}
