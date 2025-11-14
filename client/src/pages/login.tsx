import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { requestCodeSchema, verifyCodeSchema, type RequestCodeData, type VerifyCodeData, type AuthResponse } from "@shared/schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { UserCircle, Mail, KeyRound, Lock } from "lucide-react";
import logoAnimated from "@assets/logo-animated.webp";

const setPasswordSchema = z.object({
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

const passwordLoginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Digite sua senha"),
});

type SetPasswordData = z.infer<typeof setPasswordSchema>;
type PasswordLoginData = z.infer<typeof passwordLoginSchema>;

export default function LoginPage() {
  const [step, setStep] = useState<"email" | "code" | "password">("password");
  const [email, setEmail] = useState("");
  const [isPasswordReset, setIsPasswordReset] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login, isAuthenticated, isAdmin, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showSetPasswordDialog, setShowSetPasswordDialog] = useState(false);
  const [pendingUser, setPendingUser] = useState<AuthResponse | null>(null);

  // Check if session expired
  useEffect(() => {
    const sessionExpired = localStorage.getItem("sessionExpired");
    if (sessionExpired === "true") {
      localStorage.removeItem("sessionExpired");
      toast({
        title: "Sessão expirada",
        description: "Sua sessão expirou após 2 horas de inatividade. Por favor, faça login novamente.",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      if (isAdmin) {
        setLocation("/admin");
      } else {
        setLocation("/vote");
      }
    }
  }, [isAuthenticated, isAdmin, authLoading, setLocation]);

  const emailForm = useForm<RequestCodeData>({
    resolver: zodResolver(requestCodeSchema),
    defaultValues: {
      email: "",
    },
  });

  const codeForm = useForm<VerifyCodeData>({
    resolver: zodResolver(verifyCodeSchema),
    defaultValues: {
      email: "",
      code: "",
    },
  });

  const passwordForm = useForm<PasswordLoginData>({
    resolver: zodResolver(passwordLoginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const setPasswordForm = useForm<SetPasswordData>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const onRequestCode = async (data: RequestCodeData) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, isPasswordReset }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erro ao solicitar código");
      }

      const result = await response.json();

      // Check if user already has a password set and this is NOT a password reset
      if (result.hasPassword && !isPasswordReset) {
        setStep("password");
        passwordForm.setValue("email", data.email);
        emailForm.reset();
        toast({
          title: "Você já possui senha cadastrada",
          description: "Use a opção 'Esqueceu a senha?' se não lembrar da sua senha.",
          variant: "default",
        });
        return;
      }

      setEmail(data.email);
      setStep("code");
      codeForm.setValue("email", data.email);

      toast({
        title: "Código enviado!",
        description: isPasswordReset 
          ? "Código de recuperação enviado! Verifique seu email." 
          : "Verifique seu email e digite o código de 6 dígitos",
      });
    } catch (error) {
      toast({
        title: "Erro ao solicitar código",
        description: error instanceof Error ? error.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onVerifyCode = async (data: VerifyCodeData) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erro ao verificar código");
      }

      const result: AuthResponse & { requiresPasswordReset?: boolean } = await response.json();

      // Check if user needs to set password (first access or password reset)
      if (!result.user.hasPassword || result.requiresPasswordReset) {
        setPendingUser(result);
        setShowSetPasswordDialog(true);
        setPasswordForm.reset();
        if (result.requiresPasswordReset) {
          toast({
            title: "Código verificado!",
            description: "Agora defina sua nova senha",
          });
        }
        return;
      }

      login(result.user, result.token);

      toast({
        title: "Login realizado com sucesso!",
        description: `Bem-vindo, ${result.user.fullName}`,
      });

      if (result.user.isAdmin) {
        setLocation("/admin");
      } else {
        setLocation("/vote");
      }
    } catch (error) {
      toast({
        title: "Erro ao verificar código",
        description: error instanceof Error ? error.message : "Código inválido ou expirado",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onPasswordLogin = async (data: PasswordLoginData) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/login-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erro ao fazer login");
      }

      const result: AuthResponse = await response.json();
      login(result.user, result.token);

      toast({
        title: "Login realizado com sucesso!",
        description: `Bem-vindo, ${result.user.fullName}`,
      });

      if (result.user.isAdmin) {
        setLocation("/admin");
      } else {
        setLocation("/vote");
      }
    } catch (error) {
      toast({
        title: "Erro ao fazer login",
        description: error instanceof Error ? error.message : "Email ou senha incorretos",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onSetPassword = async (data: SetPasswordData) => {
    if (!pendingUser) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${pendingUser.token}`,
        },
        body: JSON.stringify({ 
          password: data.password,
          confirmPassword: data.confirmPassword 
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erro ao definir senha");
      }

      // Update user with hasPassword = true
      const updatedUser = { ...pendingUser.user, hasPassword: true };
      login(updatedUser, pendingUser.token);

      toast({
        title: "Senha definida com sucesso!",
        description: "Agora você pode fazer login com email e senha",
      });

      setShowSetPasswordDialog(false);
      setPendingUser(null);

      if (updatedUser.isAdmin) {
        setLocation("/admin");
      } else {
        setLocation("/vote");
      }
    } catch (error) {
      toast({
        title: "Erro ao definir senha",
        description: error instanceof Error ? error.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToEmail = () => {
    setStep("email");
    codeForm.reset();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="h-0.5 bg-primary w-full" />
      
      <div className="container mx-auto px-4 py-4 sm:py-0">
        <div className="max-w-md mx-auto mt-0.5 sm:mt-1">
          <div className="text-center mb-3 sm:mb-4">
            <div className="flex justify-center mb-3 sm:mb-3">
              <div className="logo-container relative w-full max-w-[133px] mx-auto">
                <img 
                  src={logoAnimated}
                  alt="Emaús Vota Logo Animado"
                  className="w-full h-auto object-contain"
                  loading="lazy"
                  decoding="async"
                  data-testid="logo-animated"
                  style={{ willChange: 'auto' }}
                />
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">Emaús Vota</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Sistema de votação da UMP Emaús</p>
          </div>

          <Card className="border-border shadow-md">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-xl sm:text-2xl flex items-center gap-2">
                {step === "email" ? (
                  <>
                    <Mail className="w-5 h-5 sm:w-6 sm:h-6" />
                    {isPasswordReset ? 'Recuperar Senha' : 'Entrar'}
                  </>
                ) : step === "password" ? (
                  <>
                    <Lock className="w-5 h-5 sm:w-6 sm:h-6" />
                    Entrar com Senha
                  </>
                ) : (
                  <>
                    <KeyRound className="w-5 h-5 sm:w-6 sm:h-6" />
                    {isPasswordReset ? 'Recuperar Senha' : 'Verificar Código'}
                  </>
                )}
              </CardTitle>
              <CardDescription className="text-sm">
                {step === "email" 
                  ? (isPasswordReset 
                      ? "Digite seu email para receber o código de recuperação de senha"
                      : "Digite seu email para receber o código de verificação")
                  : step === "password"
                  ? "Digite seu email e senha para acessar"
                  : (isPasswordReset 
                      ? `Código de recuperação enviado para ${email}`
                      : `Código enviado para ${email}`)}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              {step === "email" ? (
                <form onSubmit={emailForm.handleSubmit(onRequestCode)} className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      data-testid="input-email"
                      {...emailForm.register("email")}
                    />
                    {emailForm.formState.errors.email && (
                      <p className="text-sm text-destructive">
                        {emailForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                    data-testid="button-request-code"
                  >
                    {isLoading ? "Enviando..." : "Enviar Código"}
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">Ou</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setStep("password")}
                    data-testid="button-switch-password"
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    Já tenho senha
                  </Button>
                </form>
              ) : step === "password" ? (
                <form onSubmit={passwordForm.handleSubmit(onPasswordLogin)} className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="password-email">Email</Label>
                    <Input
                      id="password-email"
                      type="email"
                      placeholder="seu@email.com"
                      data-testid="input-password-email"
                      {...passwordForm.register("email")}
                    />
                    {passwordForm.formState.errors.email && (
                      <p className="text-sm text-destructive">
                        {passwordForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Senha</Label>
                      <button
                        type="button"
                        onClick={() => {
                          setStep("email");
                          setIsPasswordReset(true);
                          passwordForm.reset();
                          toast({
                            title: "Recuperar senha",
                            description: "Digite seu email para receber um código de verificação e redefinir sua senha",
                          });
                        }}
                        className="text-xs text-primary hover:underline"
                        data-testid="button-forgot-password"
                      >
                        Esqueceu a senha?
                      </button>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••"
                      data-testid="input-password"
                      {...passwordForm.register("password")}
                    />
                    {passwordForm.formState.errors.password && (
                      <p className="text-sm text-destructive">
                        {passwordForm.formState.errors.password.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isLoading}
                      data-testid="button-login-password"
                    >
                      {isLoading ? "Entrando..." : "Entrar"}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setStep("email");
                        setIsPasswordReset(false);
                        passwordForm.reset();
                      }}
                      disabled={isLoading}
                      data-testid="button-first-access"
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      Primeiro Acesso
                    </Button>
                  </div>
                </form>
              ) : (
                <form onSubmit={codeForm.handleSubmit(onVerifyCode)} className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="code">Código de Verificação</Label>
                    <Input
                      id="code"
                      type="text"
                      placeholder="000000"
                      maxLength={6}
                      className="text-center text-xl sm:text-2xl tracking-widest"
                      data-testid="input-code"
                      {...codeForm.register("code")}
                    />
                    {codeForm.formState.errors.code && (
                      <p className="text-sm text-destructive">
                        {codeForm.formState.errors.code.message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground text-center">
                      {isPasswordReset 
                        ? "Digite o código de recuperação de 6 dígitos enviado para seu email"
                        : "Digite o código de 6 dígitos enviado para seu email"}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isLoading}
                      data-testid="button-verify-code"
                    >
                      {isLoading ? "Verificando..." : "Verificar e Entrar"}
                    </Button>
                    
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={handleBackToEmail}
                      disabled={isLoading}
                      data-testid="button-back"
                    >
                      Voltar
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>

          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Código válido por 15 minutos
            </p>
            <p className="text-xs text-muted-foreground">
              Após o login, sua sessão fica ativa por 2 horas
            </p>
          </div>
        </div>
      </div>

      <Dialog open={showSetPasswordDialog} onOpenChange={(open) => {
        if (!open) {
          setShowSetPasswordDialog(false);
          setPendingUser(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isPasswordReset ? 'Redefinir sua Senha' : 'Defina sua Senha'}</DialogTitle>
            <DialogDescription>
              {isPasswordReset 
                ? 'Crie uma nova senha para sua conta. Sua senha anterior será substituída.'
                : 'Este é seu primeiro acesso. Crie uma senha para facilitar logins futuros.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={setPasswordForm.handleSubmit(onSetPassword)} className="space-y-6 py-4">
            <div className="space-y-3">
              <Label htmlFor="new-password">Nova Senha</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="••••••"
                data-testid="input-new-password"
                {...setPasswordForm.register("password")}
              />
              {setPasswordForm.formState.errors.password && (
                <p className="text-sm text-destructive">
                  {setPasswordForm.formState.errors.password.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Mínimo de 6 caracteres
              </p>
            </div>

            <div className="space-y-3">
              <Label htmlFor="confirm-password">Confirmar Senha</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="••••••"
                data-testid="input-confirm-password"
                {...setPasswordForm.register("confirmPassword")}
              />
              {setPasswordForm.formState.errors.confirmPassword && (
                <p className="text-sm text-destructive">
                  {setPasswordForm.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              data-testid="button-submit-password"
            >
              {isLoading ? "Salvando..." : "Definir Senha"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
